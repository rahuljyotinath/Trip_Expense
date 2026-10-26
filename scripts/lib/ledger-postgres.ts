import postgres from "postgres"
import { emptyStore, normalizeStore, type Store } from "../../src/lib/types"

export const LEDGER_ROW_ID = "main"

export function postgresUrl() {
  return (
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    ""
  )
}

function asStore(value: unknown): Store {
  if (!value || typeof value !== "object") return emptyStore()
  const record = value as Partial<Store>
  return normalizeStore({
    profiles: Array.isArray(record.profiles) ? record.profiles : [],
    groups: Array.isArray(record.groups) ? record.groups : [],
  })
}

export type LoadedLedger = { store: Store; version: number }

export async function readLedger(sql: ReturnType<typeof postgres>): Promise<LoadedLedger> {
  const rows = await sql<{ data: Store; version: string }[]>`
    SELECT data, version FROM ledger_store WHERE id = ${LEDGER_ROW_ID}
  `
  if (rows.length === 0) return { store: emptyStore(), version: 0 }
  return {
    store: asStore(rows[0]!.data),
    version: Number(rows[0]!.version),
  }
}

export async function writeLedger(
  sql: ReturnType<typeof postgres>,
  store: Store,
  expectedVersion: number
) {
  const payload = JSON.parse(JSON.stringify(store))
  if (expectedVersion === 0) {
    const inserted = await sql<{ version: string }[]>`
      INSERT INTO ledger_store (id, data, version)
      VALUES (${LEDGER_ROW_ID}, ${sql.json(payload)}, 1)
      ON CONFLICT (id) DO NOTHING
      RETURNING version
    `
    if (inserted.length > 0) return
  }
  const updated = await sql<{ version: string }[]>`
    UPDATE ledger_store
    SET
      data = ${sql.json(payload)},
      version = version + 1,
      updated_at = now()
    WHERE id = ${LEDGER_ROW_ID} AND version = ${expectedVersion}
    RETURNING version
  `
  if (updated.length === 0) {
    const err = new Error("Postgres version conflict.") as Error & { code: string }
    err.code = "PG_VERSION_CONFLICT"
    throw err
  }
}

export async function mutateLedger<T>(
  mutate: (store: Store) => T | Promise<T>
): Promise<T> {
  const url = postgresUrl()
  if (!url) throw new Error("Set POSTGRES_URL or DATABASE_URL.")
  const sql = postgres(url, { max: 1, prepare: false })
  try {
    let lastError: unknown
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const loaded = await readLedger(sql)
      const result = await mutate(loaded.store)
      const next =
        result && typeof result === "object" && "store" in result
          ? (result as { store: Store }).store
          : loaded.store
      if (next === loaded.store) return result
      try {
        await writeLedger(sql, next, loaded.version)
        return result
      } catch (error) {
        lastError = error
        if ((error as { code?: string }).code !== "PG_VERSION_CONFLICT") throw error
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not save the ledger.")
  } finally {
    await sql.end({ timeout: 5 })
  }
}
