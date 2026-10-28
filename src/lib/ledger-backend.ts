import type { Sql } from "./ledger-repository"
import { storageMode } from "./storage-mode"

let relationalCached: boolean | null = null

/** Postgres storage uses normalized tables unless LEDGER_BACKEND=blob. */
export function relationalLedgerForced(): boolean | null {
  const raw = process.env.LEDGER_BACKEND?.trim().toLowerCase()
  if (raw === "blob") return false
  if (raw === "relational") return true
  return null
}

export async function isRelationalLedger(sql: Sql): Promise<boolean> {
  const forced = relationalLedgerForced()
  if (forced !== null) return forced
  if (relationalCached !== null) return relationalCached
  if (storageMode() !== "postgres") {
    relationalCached = false
    return false
  }
  try {
    const rows = await sql<{ ready: boolean }[]>`
      SELECT to_regclass('public.trips') IS NOT NULL AS ready
    `
    relationalCached = Boolean(rows[0]?.ready)
    return relationalCached
  } catch {
    relationalCached = false
    return false
  }
}

export function resetRelationalLedgerCache() {
  relationalCached = null
}
