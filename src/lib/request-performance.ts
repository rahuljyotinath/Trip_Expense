import { AsyncLocalStorage } from "node:async_hooks"
import type { Sql } from "./ledger-repository"

type Metrics = { queryCount: number; databaseMs: number; backend?: string }
const metrics = new AsyncLocalStorage<Metrics>()

export function noteLedgerBackend(relational: boolean) {
  const current = metrics.getStore()
  if (current) current.backend = relational ? "relational" : "blob"
}

/** Measure awaited application statements, including pool/connection wait time.
 * SQL text, parameters, connection URLs and profile/trip IDs are never recorded.
 */
export function instrumentSql(sql: Sql): Sql {
  return new Proxy(sql, {
    apply(target, thisArg, args) {
      const result = Reflect.apply(target, thisArg, args)
      const current = metrics.getStore()
      // Identifier, list and JSON helpers are not database statements.
      if (!current || !Array.isArray(args[0]) || !("raw" in args[0])) return result
      let started = false
      return new Proxy(result, {
        get(query, property, receiver) {
          if (property !== "then") return Reflect.get(query, property, receiver)
          return (resolve?: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => {
            if (started) return query.then(resolve, reject)
            started = true
            current.queryCount += 1
            const start = performance.now()
            const finish = () => { current.databaseMs += performance.now() - start }
            return query.then(
              (value: unknown) => { finish(); return resolve ? resolve(value) : value },
              (error: unknown) => { finish(); if (reject) return reject(error); throw error }
            )
          }
        },
      })
    },
    get(target, property, receiver) {
      if (property !== "begin") return Reflect.get(target, property, receiver)
      return (...args: unknown[]) => {
        const callback = args.pop() as (tx: Sql) => unknown
        return Reflect.apply(target.begin, target, [
          ...args,
          (tx: Sql) => callback(instrumentSql(tx)),
        ])
      }
    },
  })
}

/** Fixed operation names only; never pass request URLs or user input. */
export async function measureRequest(operation: string, run: () => Promise<Response>) {
  const current: Metrics = { queryCount: 0, databaseMs: 0 }
  const start = performance.now()
  return metrics.run(current, async () => {
    let status = 500
    try {
      const response = await run()
      status = response.status
      response.headers.set("Server-Timing", `app;dur=${(performance.now() - start).toFixed(1)}, db;dur=${current.databaseMs.toFixed(1)}`)
      return response
    } finally {
      if (process.env.LEDGER_PERF_LOG === "1") {
        console.info(JSON.stringify({
          event: "ledger_performance",
          operation,
          status,
          durationMs: Number((performance.now() - start).toFixed(1)),
          databaseMs: Number(current.databaseMs.toFixed(1)),
          queryCount: current.queryCount,
          backend: current.backend ?? "unresolved",
          region: process.env.VERCEL_REGION ?? "local",
        }))
      }
    }
  })
}

export function withRequestPerformance<Args extends unknown[]>(
  operation: string,
  handler: (...args: Args) => Promise<Response>
) {
  return (...args: Args) => measureRequest(operation, () => handler(...args))
}
