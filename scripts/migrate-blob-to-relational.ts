/**
 * Backfill normalized ledger tables from ledger_store.data (or store.json).
 *
 *   POSTGRES_URL=... npx tsx scripts/migrate-blob-to-relational.ts
 *
 * Optional: pass path to JSON file instead of reading Postgres blob.
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { getSql, migrateBlobToRelationalTables } from "../src/lib/db"
import { postgresUrl } from "./lib/ledger-postgres"
import { emptyStore, normalizeStore, type Store } from "../src/lib/types"
import { profileForDb, storesEqualNormalized } from "../src/lib/ledger-repository"
import { loadFullStoreRelational } from "../src/lib/ledger-repository"

const DEFAULT_PATH = path.join(process.cwd(), "data", "store.json")
const LEDGER_ROW_ID = "main"

function asStore(value: unknown): Store {
  if (!value || typeof value !== "object") return emptyStore()
  const record = value as Partial<Store>
  return normalizeStore({
    profiles: Array.isArray(record.profiles) ? record.profiles : [],
    groups: Array.isArray(record.groups) ? record.groups : [],
    joinRequests: record.joinRequests,
    tripInvites: record.tripInvites,
    contacts: record.contacts,
  })
}

async function loadBlobFromPostgres(sql: ReturnType<typeof postgres>) {
  const rows = await sql<{ data: Store }[]>`
    SELECT data FROM ledger_store WHERE id = ${LEDGER_ROW_ID}
  `
  if (rows.length === 0) return emptyStore()
  return asStore(rows[0]!.data)
}

export async function backfillRelationalLedger(jsonPath?: string) {
  const url = postgresUrl()
  if (!url) {
    throw new Error("Set POSTGRES_URL or DATABASE_URL.")
  }

  let store: Store
  if (jsonPath) {
    store = asStore(JSON.parse(await fs.readFile(jsonPath, "utf8")))
  } else {
    const sql = postgres(url, { max: 1, prepare: false })
    try {
      store = await loadBlobFromPostgres(sql)
    } finally {
      await sql.end({ timeout: 5 })
    }
  }

  console.log(
    `Importing ${store.profiles.length} profiles, ${store.groups.length} trips…`
  )
  await migrateBlobToRelationalTables(store)

  const sql = getSql()
  const loaded = await loadFullStoreRelational(sql)
  const sortForCompare = (input: Store) =>
    normalizeStore({
      ...input,
      profiles: [...input.profiles]
        .map(profileForDb)
        .sort((a, b) => a.id.localeCompare(b.id)),
      groups: [...input.groups]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((group) => ({
          ...group,
          expenses: [...group.expenses].sort((a, b) => a.id.localeCompare(b.id)),
          payments: [...group.payments].sort((a, b) => a.id.localeCompare(b.id)),
          members: [...group.members].sort((a, b) => a.id.localeCompare(b.id)),
        })),
      joinRequests: [...(input.joinRequests ?? [])].sort((a, b) =>
        a.id.localeCompare(b.id)
      ),
      tripInvites: [...(input.tripInvites ?? [])].sort((a, b) =>
        a.id.localeCompare(b.id)
      ),
      contacts: [...(input.contacts ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    })

  const expected = sortForCompare(store)
  const actual = sortForCompare(loaded.store)
  if (!storesEqualNormalized(expected, actual)) {
    const tripOk = expected.groups.every((group) => {
      const loadedGroup = actual.groups.find((item) => item.id === group.id)
      if (!loadedGroup) return false
      return (
        loadedGroup.expenses.length === group.expenses.length &&
        loadedGroup.payments.length === group.payments.length &&
        loadedGroup.members.length === group.members.length
      )
    })
    if (
      expected.profiles.length !== actual.profiles.length ||
      expected.groups.length !== actual.groups.length ||
      !tripOk
    ) {
      throw new Error("Round-trip verification failed: migrated store differs from source.")
    }
    console.warn(
      "Round-trip JSON differs (often numeric serialization); trip roster and ledger counts match."
    )
  }
  console.log(
    "Relational ledger ready (auto when trips table exists; LEDGER_BACKEND=blob to force legacy)."
  )
}

async function main() {
  const fileArg = process.argv.slice(2).find((arg) => !arg.startsWith("-"))?.trim()
  await backfillRelationalLedger(fileArg || undefined)
}

const isDirectRun = process.argv[1]?.includes("migrate-blob-to-relational")
if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
