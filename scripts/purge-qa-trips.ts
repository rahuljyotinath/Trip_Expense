/**
 * Remove [QA-TEMP] trips from the Postgres ledger.
 *
 *   POSTGRES_URL=... npx tsx scripts/purge-qa-trips.ts
 *   POSTGRES_URL=... npx tsx scripts/purge-qa-trips.ts --dry-run
 */
import type { Store } from "../src/lib/types"
import { mutateLedger, postgresUrl, readLedger } from "./lib/ledger-postgres"
import postgres from "postgres"

const QA_PREFIX = "[QA-TEMP]"

function purge(store: Store) {
  const removed = store.groups.filter((g) => g.name.startsWith(QA_PREFIX))
  const kept = store.groups.filter((g) => !g.name.startsWith(QA_PREFIX))
  return {
    store: { ...store, groups: kept },
    removed,
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  if (!postgresUrl()) {
    console.error("Set POSTGRES_URL or DATABASE_URL.")
    process.exit(1)
  }

  const url = postgresUrl()
  const sql = postgres(url, { max: 1, prepare: false })
  try {
    const loaded = await readLedger(sql)
    const { removed } = purge(loaded.store)
    if (removed.length === 0) {
      console.log("No QA trips to remove.")
      return
    }
    console.log(
      dryRun ? "Would remove:" : "Removing:",
      removed.map((g) => ({ id: g.id, name: g.name, code: g.code }))
    )
    if (dryRun) return
  } finally {
    await sql.end({ timeout: 5 })
  }

  await mutateLedger((store) => {
    const { store: next, removed } = purge(store)
    if (removed.length === 0) return store
    return { store: next, removed }
  })
  console.log("Done.")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
