import { promises as fs } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import {
  emptyStore,
  normalizeGroup,
  normalizeProfile,
  normalizeStore,
  type Group,
  type Profile,
  type Store,
} from "./types"
import { postgresConfig, storageMode } from "./storage-mode"
import { storesEqual } from "./store-compare"

export { postgresConfig, storageMode } from "./storage-mode"

const LOCAL_PATH = path.join(process.cwd(), "data", "store.json")
const LEDGER_ROW_ID = "main"

const LOAD_CACHE_MS =
  Number(process.env.LEDGER_LOAD_CACHE_MS || process.env.GITHUB_LOAD_CACHE_MS) || 3000

type Loaded = {
  store: Store
  version?: number
}

export type PostgresProbe = {
  connected: boolean
  error: string | null
  version?: number
}

let queue: Promise<unknown> = Promise.resolve()

let loadCache: { loaded: Loaded; at: number } | null = null

let postgresClient: ReturnType<typeof postgres> | null = null

function enqueue<T>(job: () => Promise<T>) {
  const run = queue.then(job, job)
  queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function getPostgres() {
  const url = postgresConfig()
  if (!url) throw new Error("Postgres is not configured.")
  if (!postgresClient) {
    postgresClient = postgres(url, {
      max: 1,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
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
    const sql = getPostgres()
    await sql`SELECT 1`
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

async function readPostgres(): Promise<Loaded> {
  const sql = getPostgres()
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

async function writePostgres(store: Store, expectedVersion: number) {
  const sql = getPostgres()
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

async function load(force = false): Promise<Loaded> {
  if (!force) {
    const cached = peekFreshLoadCache()
    if (cached) return cached
  }
  const mode = storageMode()
  const loaded = mode === "postgres" ? await readPostgres() : await readLocal()
  setLoadCache(loaded)
  return loaded
}

async function save(store: Store, loaded: Loaded) {
  const mode = storageMode()
  if (mode === "postgres") {
    await writePostgres(store, loaded.version ?? 0)
    invalidateLoadCache()
    return
  }
  await writeLocal(store)
  setLoadCache({ store })
}

export async function readStore() {
  return (await load()).store
}

export async function readStoreFresh() {
  invalidateLoadCache()
  return (await load(true)).store
}

function profilesFromUnknown(value: unknown): Profile[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeProfile(item as Profile))
}

async function readPostgresProfiles(): Promise<Profile[]> {
  const sql = getPostgres()
  const rows = await sql<{ profiles: unknown }[]>`
    SELECT data->'profiles' AS profiles FROM ledger_store WHERE id = ${LEDGER_ROW_ID}
  `
  if (rows.length === 0) return []
  return profilesFromUnknown(rows[0]!.profiles)
}

async function readPostgresProfileById(profileId: string): Promise<Profile | null> {
  const sql = getPostgres()
  const rows = await sql<{ profile: Profile }[]>`
    SELECT elem AS profile
    FROM ledger_store,
      jsonb_array_elements(data->'profiles') AS elem
    WHERE ledger_store.id = ${LEDGER_ROW_ID}
      AND elem->>'id' = ${profileId}
    LIMIT 1
  `
  const row = rows[0]?.profile
  return row ? normalizeProfile(row) : null
}

async function readPostgresGroupById(groupId: string): Promise<Group | null> {
  const sql = getPostgres()
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

/** Trip GET: one group row when on Postgres (avoids loading full ledger). */
export async function readGroupById(id: string): Promise<Group | null> {
  const groupId = id.trim()
  if (!groupId) return null
  if (storageMode() === "postgres") {
    return readPostgresGroupById(groupId)
  }
  const store = await readStore()
  return store.groups.find((item) => item.id === groupId) ?? null
}

/** Auth login: profiles only (avoids loading full trip ledger). */
export async function readProfilesForAuth(): Promise<Store> {
  const mode = storageMode()
  if (mode === "postgres") {
    const profiles = await readPostgresProfiles()
    return normalizeStore({ profiles, groups: [] })
  }
  const store = await readStore()
  return normalizeStore({ profiles: store.profiles, groups: [] })
}

/** Session restore: one profile row when on Postgres. */
export async function readProfileForSession(profileId: string): Promise<Profile | null> {
  const id = profileId.trim()
  if (!id) return null
  if (storageMode() === "postgres") {
    return readPostgresProfileById(id)
  }
  const store = await readStore()
  return store.profiles.find((item) => item.id === id) ?? null
}

export async function updateStore<T>(mutator: (store: Store) => T | Promise<T>) {
  return enqueue(async () => {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const loaded = await load(attempt > 0)
      const result = await mutator(loaded.store)
      const next =
        result && typeof result === "object" && "store" in result
          ? (result as { store: Store }).store
          : loaded.store
      if (storesEqual(next, loaded.store)) {
        return result
      }
      try {
        await save(next, loaded)
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
