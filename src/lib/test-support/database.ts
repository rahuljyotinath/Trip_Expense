import { readFile, readdir } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import type { Sql } from "../ledger-repository"

type Fragment = { list: string[] } | { identifier: string }
type Statement = { text: string; parameters: unknown[] }

// Exercise the repository's SQL on Postgres in WASM, without a production database.
// This adapter only implements the postgres.js helpers used by this repository.
export async function database() {
  const db = new PGlite()
  for (const name of (await readdir("supabase/migrations")).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"))
  const statements: Statement[] = []
  function makeSql(query: (text: string, parameters: unknown[]) => Promise<unknown[]>) {
    const tag = (strings: TemplateStringsArray | string | string[], ...values: unknown[]) => {
      if (typeof strings === "string") return { identifier: strings }
      if (!("raw" in strings)) return { list: strings }
      const parameters: unknown[] = []
      const parameter = (value: unknown) => { parameters.push(value); return `$${parameters.length}` }
      const text = strings.reduce((text, part, index) => {
        if (index === 0) return part
        const value = values[index - 1]
        const fragment = value as Fragment | null
        const interpolation = fragment && typeof fragment === "object" && "identifier" in fragment
          ? `"${fragment.identifier}"`
          : fragment && typeof fragment === "object" && "list" in fragment
            ? `(${fragment.list.map(parameter).join(", ")})`
            : parameter(value)
        return text + interpolation + part
      }, "")
      statements.push({ text, parameters })
      return query(text, parameters)
    }
    const sql = tag as unknown as Sql
    sql.json = ((value: unknown) => JSON.stringify(value)) as unknown as Sql["json"]
    sql.begin = (async (job: (tx: Sql) => Promise<unknown>) => db.transaction(async (tx) =>
      job(makeSql(async (text, parameters) => (await tx.query(text, parameters)).rows))
    )) as unknown as Sql["begin"]
    return sql
  }
  return {
    db,
    sql: makeSql(async (text, parameters) => (await db.query(text, parameters)).rows),
    statements,
  }
}
