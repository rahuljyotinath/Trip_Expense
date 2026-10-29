/** Read-only connection check. Supply POSTGRES_URL through the environment. */
import postgres from "postgres"
import { isRelationalLedger } from "../src/lib/ledger-backend"
import { postgresConfig } from "../src/lib/storage-mode"
import { postgresJsOptions } from "../src/lib/postgres-connect"

async function main() {
  const connectionString = postgresConfig()
  if (!connectionString) {
    console.error("DATABASE_NOT_CONFIGURED")
    process.exitCode = 1
    return
  }
  const url = new URL(connectionString)
  const options = postgresJsOptions(connectionString)
  const pooler = url.hostname.endsWith(".pooler.supabase.com")
  const regionHint = pooler
    ? url.hostname.match(/^[a-z]+-\d+-(.+)\.pooler\.supabase\.com$/)?.[1] ?? null
    : null
  const sql = postgres(connectionString, options)
  try {
    const timings: number[] = []
    for (let iteration = 0; iteration < 6; iteration++) {
      const start = performance.now()
      await sql`SELECT 1`
      timings.push(Number((performance.now() - start).toFixed(1)))
    }
    console.log(JSON.stringify({
      backend: await isRelationalLedger(sql) ? "relational" : "blob",
      applicationRegion: process.env.VERCEL_REGION ?? "not-running-on-vercel",
      databaseRegionHint: regionHint,
      connectionMode: pooler
        ? (url.port === "6543" ? "transaction-pooler" : "session-pooler")
        : "direct-or-other",
      poolMax: options.max,
      preparedStatements: options.prepare,
      tlsRequired: options.ssl === "require",
      firstQueryMs: timings[0],
      warmQueryMs: timings.slice(1),
    }, null, 2))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error: unknown) => {
  // Driver messages may contain connection details; emit only a safe error code.
  const code = (error as { code?: string }).code
  console.error(code && /^[A-Z0-9_]+$/.test(code) ? code : "DIAGNOSTIC_FAILED")
  process.exitCode = 1
})
