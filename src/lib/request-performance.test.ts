import assert from "node:assert/strict"
import test from "node:test"
import { instrumentSql, measureRequest, noteLedgerBackend } from "./request-performance"
import type { Sql } from "./ledger-repository"

function client() {
  const sql = ((strings: TemplateStringsArray | string | string[]) => {
    if (!Array.isArray(strings) || !("raw" in strings)) return { helper: strings }
    // Like postgres.js, defer execution until the statement is awaited.
    return { then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve) }
  }) as unknown as Sql
  sql.json = ((value: unknown) => ({ json: value })) as unknown as Sql["json"]
  sql.begin = ((job: (tx: Sql) => unknown) => Promise.resolve(job(sql))) as unknown as Sql["begin"]
  return instrumentSql(sql)
}

test("request metrics isolate concurrent requests and include statements inside transactions", async (t) => {
  const previous = process.env.LEDGER_PERF_LOG
  process.env.LEDGER_PERF_LOG = "1"
  const logs: string[] = []
  t.mock.method(console, "info", (line: string) => { logs.push(line) })
  try {
    const sql = client()
    const responses = await Promise.all([
      measureRequest("trip.read", async () => {
        noteLedgerBackend(true)
        sql("members")
        sql(["p1", "p2"])
        sql.json({ private: "sensitive-value" })
        await sql`SELECT ${"sensitive-value"}`
        await sql.begin(async (tx) => { await tx`UPDATE trips SET version = version + 1` })
        return Response.json({ ok: true })
      }),
      measureRequest("groups.list", async () => {
        await sql`SELECT 1`
        return Response.json({}, { status: 403 })
      }),
    ])
    const read = logs.map((line) => JSON.parse(line)).find((row) => row.operation === "trip.read")
    const list = logs.map((line) => JSON.parse(line)).find((row) => row.operation === "groups.list")
    assert.equal(read.queryCount, 2)
    assert.equal(read.backend, "relational")
    assert.equal(list.queryCount, 1)
    assert.equal(list.status, 403)
    assert.ok(read.databaseMs >= 0)
    assert.match(responses[0].headers.get("Server-Timing")!, /app;dur=[\d.]+, db;dur=[\d.]+/)
    assert.ok(logs.every((line) => !line.includes("sensitive-value") && !line.includes("SELECT")))
  } finally {
    if (previous === undefined) delete process.env.LEDGER_PERF_LOG
    else process.env.LEDGER_PERF_LOG = previous
  }
})

test("timing headers remain available with logging disabled and database failures propagate", async (t) => {
  const previous = process.env.LEDGER_PERF_LOG
  delete process.env.LEDGER_PERF_LOG
  const logger = t.mock.method(console, "info", () => {})
  try {
    const sql = client()
    const response = await measureRequest("trip.save", async () => {
      await sql`SELECT 1`
      return Response.json({ ok: true })
    })
    assert.ok(response.headers.has("Server-Timing"))
    assert.equal(logger.mock.callCount(), 0)
    const failing = instrumentSql((() => Promise.reject(new Error("database unavailable"))) as unknown as Sql)
    await assert.rejects(measureRequest("trip.save", async () => {
      await failing`SELECT 1`
      return Response.json({})
    }), /database unavailable/)
    assert.equal(logger.mock.callCount(), 0)
  } finally {
    if (previous !== undefined) process.env.LEDGER_PERF_LOG = previous
  }
})
