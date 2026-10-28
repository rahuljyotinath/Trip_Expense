import { promises as fs } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { isRelationalLedger } from "./ledger-backend"
import {
  importStoreToRelational,
  loadAllProfiles,
  loadContacts,
  loadFullStoreRelational,
  loadGroupByCodeRelational,
  loadGroupRelational,
  loadGroupsForProfileRelational,
  loadJoinRequests,
  loadProfilesByIdsRelational,
  loadStoreForMutationRelational,
  loadTripInvites,
  persistStoreDiffRelational,
  readLedgerStatsRelational,
  type MutationScope,
  type RelationalLoadState,
  type Sql,
} from "./ledger-repository"
import {
  emptyStore,
  normalizeGroup,
  normalizeProfile,
  normalizeStore,
  type Group,
  type JoinRequest,
  type Profile,
  type Store,
  type TripInvite,
} from "./types"
import { postgresConfig, storageMode } from "./storage-mode"
import { storesEqual } from "./store-compare"

export { postgresConfig, storageMode } from "./storage-mode"
export type { MutationScope } from "./ledger-repository"

const LOCAL_PATH = path.join(process.cwd(), "data", "store.json")
const LEDGER_ROW_ID = "main"

const LOAD_CACHE_MS =
  Number(process.env.LEDGER_LOAD_CACHE_MS || process.env.GITHUB_LOAD_CACHE_MS) || 3000

type Loaded = {
  store: Store
  version?: number
  relational?: RelationalLoadState
}

export type PostgresProbe = {
  connected: boolean
  error: string | null
  version?: number
}

let writeQueue: Promise<unknown> = Promise.resolve()

let loadCache: { loaded: Loaded; at: number } | null = null

let postgresClient: Sql | null = null

function enqueueWrite<T>(job: () => Promise<T>) {
  const run = writeQueue.then(job, job)
  writeQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export function getSql(): Sql {
  const url = postgresConfig()
  if (!url) throw new Error("Postgres is not configured.")
  if (!postgresClient) {
    postgresClient = postgres(url, {
      max: Number(process.env.POSTGRES_POOL_MAX || 4),
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 60,
    })
  }
  return postgresClient
}

function isVersionConflict(error: unknown) {
  return (
    (error as { code?: string }).code === "PG_VERSION_CONFLICT" ||
    (error as { status?: number }).status === 409 ||
    (error as { status?: number }).status === 422
  )
}

function peekFreshLoadCache(): Loaded | null {
  if (!loadCache) return null
  if (Date.now() - loadCache.at > LOAD_CACHE_MS) return null
  return loadCache.loaded
}

function setLoadCache(loaded: Loaded) {
  loadCache = { loaded, at: Date.now() }
}

export function invalidateLoadCache() {
  loadCache = null
}

export async function probePostgres(): Promise<PostgresProbe> {
  if (!postgresConfig()) {
    return { connected: false, error: "Set POSTGRES_URL or DATABASE_URL." }
  }
  try {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      const rows = await sql<{ version: string }[]>`
        SELECT version FROM ledger_meta WHERE id = ${LEDGER_ROW_ID}
      `
      const version = rows[0] ? Number(rows[0].version) : undefined
      return { connected: true, error: null, version }
    }
    const rows = await sql<{ version: string }[]>`
      SELECT version FROM ledger_store WHERE id = ${LEDGER_ROW_ID}
    `
    const version = rows[0] ? Number(rows[0].version) : undefined
    return { connected: true, error: null, version }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Postgres request failed."
    return { connected: false, error: message }
  }
}

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

async function readLocal(): Promise<Loaded> {
  try {
    const raw = await fs.readFile(LOCAL_PATH, "utf8")
    return { store: asStore(JSON.parse(raw)) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { store: emptyStore() }
    }
    throw error
  }
}

async function writeLocal(store: Store) {
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true })
  await fs.writeFile(LOCAL_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8")
}

async function readPostgresBlob(): Promise<Loaded> {
  const sql = getSql()
  const rows = await sql<{ data: Store; version: string }[]>`
    SELECT data, version FROM ledger_store WHERE id = ${LEDGER_ROW_ID}
  `
  if (rows.length === 0) {
    return { store: emptyStore(), version: 0 }
  }
  return {
    store: asStore(rows[0]!.data),
    version: Number(rows[0]!.version),
  }
}

async function writePostgresBlob(store: Store, expectedVersion: number) {
  const sql = getSql()
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

async function loadBlob(force = false): Promise<Loaded> {
  if (!force) {
    const cached = peekFreshLoadCache()
    if (cached) return cached
  }
  const loaded = await readPostgresBlob()
  setLoadCache(loaded)
  return loaded
}

async function loadRelational(force = false): Promise<Loaded> {
  if (!force) {
    const cached = peekFreshLoadCache()
    if (cached?.relational) return cached
  }
  const sql = getSql()
  const relational = await loadFullStoreRelational(sql)
  const loaded: Loaded = {
    store: relational.store,
    relational,
    version: relational.metaVersion,
  }
  setLoadCache(loaded)
  return loaded
}

async function load(force = false): Promise<Loaded> {
  const mode = storageMode()
  if (mode === "local") {
    if (!force) {
      const cached = peekFreshLoadCache()
      if (cached) return cached
    }
    const loaded = await readLocal()
    setLoadCache(loaded)
    return loaded
  }
  const sql = getSql()
  if (await isRelationalLedger(sql)) {
    return loadRelational(force)
  }
  return loadBlob(force)
}

async function saveBlob(store: Store, loaded: Loaded) {
  await writePostgresBlob(store, loaded.version ?? 0)
  invalidateLoadCache()
}

async function saveRelational(before: Store, after: Store, loaded: Loaded) {
  if (!loaded.relational) throw new Error("Relational load state missing.")
  const sql = getSql()
  await persistStoreDiffRelational(sql, before, after, loaded.relational)
  invalidateLoadCache()
}

async function save(before: Store, after: Store, loaded: Loaded) {
  const mode = storageMode()
  if (mode === "local") {
    await writeLocal(after)
    setLoadCache({ store: after })
    return
  }
  const sql = getSql()
  if (await isRelationalLedger(sql)) {
    await saveRelational(before, after, loaded)
    return
  }
  await saveBlob(after, loaded)
}

export async function readStore() {
  return (await load()).store
}

export async function readStoreFresh() {
  invalidateLoadCache()
  return (await load(true)).store
}

export type StoreLedgerMeta = {
  joinRequests: JoinRequest[]
  tripInvites: TripInvite[]
}

export async function readStoreLedgerMeta(): Promise<StoreLedgerMeta> {
  if (storageMode() === "postgres") {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      const [joinRequests, tripInvites] = await Promise.all([
        loadJoinRequests(sql),
        loadTripInvites(sql),
      ])
      return { joinRequests, tripInvites }
    }
    const rows = await sql<{ join_requests: unknown; trip_invites: unknown }[]>`
      SELECT
        data->'joinRequests' AS join_requests,
        data->'tripInvites' AS trip_invites
      FROM ledger_store
      WHERE id = ${LEDGER_ROW_ID}
    `
    if (rows.length === 0) {
      return { joinRequests: [], tripInvites: [] }
    }
    const store = normalizeStore({
      profiles: [],
      groups: [],
      joinRequests: rows[0]!.join_requests as JoinRequest[],
      tripInvites: rows[0]!.trip_invites as TripInvite[],
    })
    return {
      joinRequests: store.joinRequests ?? [],
      tripInvites: store.tripInvites ?? [],
    }
  }
  const store = await readStore()
  return {
    joinRequests: store.joinRequests ?? [],
    tripInvites: store.tripInvites ?? [],
  }
}

export async function readProfilesByIds(ids: string[]): Promise<Profile[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return []
  if (storageMode() === "postgres") {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      return loadProfilesByIdsRelational(sql, unique)
    }
    const rows = await sql<{ profile: Profile }[]>`
      SELECT elem AS profile
      FROM ledger_store,
        jsonb_array_elements(data->'profiles') AS elem
      WHERE ledger_store.id = ${LEDGER_ROW_ID}
        AND elem->>'id' IN ${sql(unique)}
    `
    return rows.map((row) => normalizeProfile(row.profile))
  }
  const store = await readStore()
  const wanted = new Set(unique)
  return store.profiles.filter((item) => wanted.has(item.id))
}

export type LedgerHealthStats = {
  ledgerDataBytes: number | null
  profileCount: number | null
  tripCount: number | null
  expenseCount: number | null
  paymentCount: number | null
}

export async function readLedgerHealthStats(): Promise<LedgerHealthStats | null> {
  if (storageMode() !== "postgres") return null
  try {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      const stats = await readLedgerStatsRelational(sql)
      if (!stats) return null
      return {
        ledgerDataBytes: stats.blob_bytes,
        profileCount: Number(stats.profiles),
        tripCount: Number(stats.trips),
        expenseCount: Number(stats.expenses),
        paymentCount: Number(stats.payments),
      }
    }
    const rows = await sql<{ bytes: number }[]>`
      SELECT octet_length(data::text)::int AS bytes
      FROM ledger_store
      WHERE id = ${LEDGER_ROW_ID}
    `
    return {
      ledgerDataBytes: rows[0]?.bytes ?? null,
      profileCount: null,
      tripCount: null,
      expenseCount: null,
      paymentCount: null,
    }
  } catch {
    return null
  }
}

/** @deprecated Use readLedgerHealthStats */
export async function readLedgerDataByteSize(): Promise<number | null> {
  const stats = await readLedgerHealthStats()
  return stats?.ledgerDataBytes ?? null
}

export async function readGroupById(id: string): Promise<Group | null> {
  const groupId = id.trim()
  if (!groupId) return null
  if (storageMode() === "postgres") {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      return loadGroupRelational(sql, groupId)
    }
    const rows = await sql<{ trip: Group }[]>`
      SELECT elem AS trip
      FROM ledger_store,
        jsonb_array_elements(data->'groups') AS elem
      WHERE ledger_store.id = ${LEDGER_ROW_ID}
        AND elem->>'id' = ${groupId}
      LIMIT 1
    `
    const row = rows[0]?.trip
    return row ? normalizeGroup(row) : null
  }
  const store = await readStore()
  return store.groups.find((item) => item.id === groupId) ?? null
}

export async function readGroupsForProfile(profileId: string): Promise<Group[]> {
  if (storageMode() === "postgres") {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      return loadGroupsForProfileRelational(sql, profileId)
    }
  }
  const store = await readStore()
  return store.groups.filter((group) =>
    group.members.some((member) => member.profileId === profileId)
  )
}

export async function readGroupByCode(code: string): Promise<Group | null> {
  if (storageMode() === "postgres") {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      return loadGroupByCodeRelational(sql, code)
    }
  }
  const store = await readStore()
  const normalized = code.replace(/\s+/g, "").toUpperCase()
  return store.groups.find((group) => group.code === normalized) ?? null
}

/** Profiles + contacts for contact list (no trips). */
export async function readStoreForContacts(): Promise<Store> {
  if (storageMode() === "postgres") {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      const [profiles, contacts] = await Promise.all([
        loadAllProfiles(sql),
        loadContacts(sql),
      ])
      return normalizeStore({ profiles, groups: [], contacts })
    }
  }
  return readStore()
}

/** All profiles for username / email / phone search. */
export async function readStoreForProfileSearch(): Promise<Store> {
  if (storageMode() === "postgres") {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      const profiles = await loadAllProfiles(sql)
      return normalizeStore({ profiles, groups: [] })
    }
  }
  return readStore()
}

/** Invites list: session profile, meta, trip name stubs. */
export async function readStoreForTripInvites(sessionProfile: Profile): Promise<Store> {
  if (storageMode() === "postgres") {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      const meta = await readStoreLedgerMeta()
      const groupIds = [...new Set((meta.tripInvites ?? []).map((item) => item.groupId))]
      const groups: Group[] = []
      for (const groupId of groupIds) {
        const header = await sql<
          { id: string; name: string; code: string }[]
        >`SELECT id, name, code FROM trips WHERE id = ${groupId}`
        const row = header[0]
        if (row) {
          groups.push(
            normalizeGroup({
              id: row.id,
              name: row.name,
              code: row.code,
              currency: "INR",
              startDate: null,
              endDate: null,
              createdByProfileId: "",
              createdAt: "",
              members: [],
              expenses: [],
              payments: [],
            })
          )
        }
      }
      return normalizeStore({
        profiles: [sessionProfile],
        groups,
        joinRequests: meta.joinRequests,
        tripInvites: meta.tripInvites,
      })
    }
  }
  return readStore()
}

export async function readProfilesForAuth(): Promise<Store> {
  const mode = storageMode()
  if (mode === "postgres") {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      const profiles = await loadAllProfiles(sql)
      return normalizeStore({ profiles, groups: [] })
    }
    const rows = await sql<{ profiles: unknown }[]>`
      SELECT data->'profiles' AS profiles FROM ledger_store WHERE id = ${LEDGER_ROW_ID}
    `
    if (rows.length === 0) return normalizeStore({ profiles: [], groups: [] })
    const profiles = Array.isArray(rows[0]!.profiles)
      ? (rows[0]!.profiles as Profile[]).map(normalizeProfile)
      : []
    return normalizeStore({ profiles, groups: [] })
  }
  const store = await readStore()
  return normalizeStore({ profiles: store.profiles, groups: [] })
}

export async function readProfileForSession(profileId: string): Promise<Profile | null> {
  const id = profileId.trim()
  if (!id) return null
  if (storageMode() === "postgres") {
    const sql = getSql()
    if (await isRelationalLedger(sql)) {
      const rows = await loadProfilesByIdsRelational(sql, [id])
      return rows[0] ?? null
    }
    const rows = await sql<{ profile: Profile }[]>`
      SELECT elem AS profile
      FROM ledger_store,
        jsonb_array_elements(data->'profiles') AS elem
      WHERE ledger_store.id = ${LEDGER_ROW_ID}
        AND elem->>'id' = ${id}
      LIMIT 1
    `
    const row = rows[0]?.profile
    return row ? normalizeProfile(row) : null
  }
  const store = await readStore()
  return store.profiles.find((item) => item.id === id) ?? null
}

export type UpdateStoreOptions = {
  scope?: MutationScope
}

async function loadForMutation(
  scope: MutationScope | undefined,
  force: boolean
): Promise<Loaded> {
  const mode = storageMode()
  if (mode === "local") {
    return load(force)
  }
  const sql = getSql()
  if (!(await isRelationalLedger(sql))) {
    return loadBlob(force)
  }
  const relational = await loadStoreForMutationRelational(
    sql,
    scope ?? { kind: "createTrip" }
  )
  return {
    store: relational.store,
    relational,
    version: relational.metaVersion,
  }
}

export async function updateStore<T>(
  mutator: (store: Store) => T | Promise<T>,
  options?: UpdateStoreOptions
) {
  return enqueueWrite(async () => {
    let lastError: unknown
    const scope = options?.scope
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const loaded = await loadForMutation(scope, attempt > 0)
      const before = loaded.store
      const result = await mutator(before)
      const next =
        result && typeof result === "object" && "store" in result
          ? (result as { store: Store }).store
          : before
      if (storesEqual(next, before)) {
        return result
      }
      try {
        await save(before, next, loaded)
        return result
      } catch (error) {
        lastError = error
        invalidateLoadCache()
        if (!isVersionConflict(error)) throw error
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not save the ledger.")
  })
}

export async function migrateBlobToRelationalTables(store: Store) {
  const sql = getSql()
  await importStoreToRelational(sql, store)
  invalidateLoadCache()
}

export function storageErrorMessage(postgres?: PostgresProbe) {
  const mode = storageMode()
  if (mode === "postgres") {
    if (postgres && !postgres.connected) return postgres.error
    return null
  }
  if (mode === "unconfigured") {
    return "This Vercel deploy has no database. Set POSTGRES_URL (Supabase)."
  }
  return null
}
