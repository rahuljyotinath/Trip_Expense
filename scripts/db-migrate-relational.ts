/**
 * Apply relational ledger schema (002) and backfill from ledger_store / JSON.
 *
 *   POSTGRES_URL=... npx tsx scripts/db-migrate-relational.ts
 *   POSTGRES_URL=... npx tsx scripts/db-migrate-relational.ts --sql-only
 *   POSTGRES_URL=... npx tsx scripts/db-migrate-relational.ts --data-only
 *   POSTGRES_URL=... npx tsx scripts/db-migrate-relational.ts path/to/store.json
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { postgresUrl } from "./lib/ledger-postgres"

function loadDotEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), name)
    if (!existsSync(filePath)) continue
    for (const line of readFileSync(filePath, "utf8").split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  }
}

async function applySqlFile(sql: ReturnType<typeof postgres>, relativePath: string) {
  const filePath = path.join(process.cwd(), relativePath)
  const body = readFileSync(filePath, "utf8")
  console.log(`Applying ${relativePath}…`)
  await sql.unsafe(body)
}

async function main() {
  loadDotEnvFiles()
  const url = postgresUrl()
  if (!url) {
    console.error(
      "Set POSTGRES_URL (or DATABASE_URL), e.g. in .env.local or the shell."
    )
    process.exit(1)
  }

  const args = process.argv.slice(2).filter((item) => !item.startsWith("-"))
  const sqlOnly = process.argv.includes("--sql-only")
  const dataOnly = process.argv.includes("--data-only")
  const jsonPath = args[0]

  const sql = postgres(url, { max: 1, prepare: false })
  try {
    if (!dataOnly) {
      const hasLedger = await sql<{ reg: string | null }[]>`
        SELECT to_regclass('public.ledger_store')::text AS reg
      `
      if (!hasLedger[0]?.reg) {
        await applySqlFile(sql, "supabase/migrations/001_ledger_store.sql")
      }
      await applySqlFile(sql, "supabase/migrations/002_relational_ledger.sql")
      console.log("Schema migration complete.")
    }

    if (!sqlOnly) {
      const { backfillRelationalLedger } = await import("./migrate-blob-to-relational")
      await backfillRelationalLedger(jsonPath)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
