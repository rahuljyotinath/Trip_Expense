/**
 * One-time import of ledger JSON into Supabase Postgres.
 *
 *   POSTGRES_URL=... npx tsx scripts/import-ledger-to-postgres.ts
 *
 * Source: data/store.json (or pass a path as the first argument).
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { importStoreToRelational } from "../src/lib/ledger-repository"
import { emptyStore, normalizeStore, type Store } from "../src/lib/types"

const LEDGER_ROW_ID = "main"
const DEFAULT_PATH = path.join(process.cwd(), "data", "store.json")

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

async function loadFromFile(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8")
  return asStore(JSON.parse(raw))
}

async function main() {
  const url =
    process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim() || ""
  if (!url) {
    console.error("Set POSTGRES_URL or DATABASE_URL.")
    process.exit(1)
  }

  const source = process.argv[2]?.trim() || DEFAULT_PATH
  let store: Store
  try {
    store = await loadFromFile(source)
  } catch (error) {
    console.error(`Could not load ledger from ${source}:`, error)
    process.exit(1)
  }

  const sql = postgres(url, { max: 1, prepare: false })
  const payload = JSON.parse(JSON.stringify(store))

  await sql`
    INSERT INTO ledger_store (id, data, version)
    VALUES (${LEDGER_ROW_ID}, ${sql.json(payload)}, 1)
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      version = ledger_store.version + 1,
      updated_at = now()
  `

  const rows = await sql<{ version: string }[]>`
    SELECT version FROM ledger_store WHERE id = ${LEDGER_ROW_ID}
  `
  console.log(
    `Imported ${store.profiles.length} profiles, ${store.groups.length} groups from ${source} (version ${rows[0]?.version ?? "?"}).`
  )
  try {
    await importStoreToRelational(sql, store)
    console.log("Relational tables populated (requires migration 002).")
  } catch (error) {
    console.warn(
      "Relational import skipped — apply supabase/migrations/002_relational_ledger.sql first.",
      error instanceof Error ? error.message : error
    )
  }
  await sql.end({ timeout: 5 })
}

void main()
