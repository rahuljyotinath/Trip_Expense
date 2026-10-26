import { promises as fs } from "node:fs"
import path from "node:path"
import { Octokit } from "octokit"
import postgres from "postgres"
import { emptyStore, normalizeStore, type Store } from "./types"
import {
  githubUrl,
  resolveGithubTarget,
  type GithubTarget,
} from "./github-target"
import { githubConfig, postgresConfig, storageMode } from "./storage-mode"
import { storesEqual } from "./store-compare"

export { DEFAULT_GITHUB_REPO, resolveGithubTarget } from "./github-target"
export { postgresConfig, storageMode } from "./storage-mode"

const LOCAL_PATH = path.join(process.cwd(), "data", "store.json")
const LEDGER_ROW_ID = "main"

const LOAD_CACHE_MS = Number(process.env.GITHUB_LOAD_CACHE_MS) || 3000

type Loaded = {
  store: Store
  sha?: string
  version?: number
}

export type GithubProbe = GithubTarget & {
  connected: boolean
  githubUrl: string
  sha?: string
  error: string | null
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
    postgresClient = postgres(url, { max: 1, prepare: false })
  }
  return postgresClient
}

function githubErrorMessage(error: unknown) {
  const status = (error as { status?: number }).status
  const message = error instanceof Error ? error.message : "GitHub request failed."
  if (status === 401) return "GitHub token was rejected."
  if (status === 403) return "GitHub token cannot write this repo. Needs Contents: Read and write."
  if (status === 404) return "GitHub repo not found, or the token cannot see it."
  if (status === 409) return "GitHub repo is empty. First Contents write should create data/store.json."
  return message
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

export async function probeGithub(): Promise<GithubProbe> {
  const target = resolveGithubTarget()
  const base: GithubProbe = {
    ...target,
    connected: false,
    githubUrl: githubUrl(target),
    error: null,
  }
  const config = githubConfig()
  if (!config) {
    return {
      ...base,
      error: `Set GITHUB_TOKEN with Contents: Read and write on ${target.fullName}.`,
    }
  }

  const octokit = new Octokit({ auth: config.token })
  try {
    await octokit.rest.repos.get({ owner: config.owner, repo: config.repo })
  } catch (error) {
    return { ...base, error: githubErrorMessage(error) }
  }

  const cached = peekFreshLoadCache()
  if (cached?.sha) {
    return { ...base, connected: true, sha: cached.sha, error: null }
  }

  try {
    const loaded = await readGithub()
    setLoadCache(loaded)
    if (loaded.sha) {
      return { ...base, connected: true, sha: loaded.sha, error: null }
    }
    return { ...base, connected: true, error: null }
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 404) {
      setLoadCache({ store: emptyStore() })
      return { ...base, connected: true, error: null }
    }
    return { ...base, error: githubErrorMessage(error) }
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

async function readGithub(): Promise<Loaded> {
  const config = githubConfig()
  if (!config) throw new Error("GitHub file storage is not configured.")
  const octokit = new Octokit({ auth: config.token })
  try {
    const response = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: config.filePath,
      ref: config.branch,
    })
    if (Array.isArray(response.data) || response.data.type !== "file") {
      throw new Error("GitHub path is not a file.")
    }
    const encoded = response.data.content.replace(/\n/g, "")
    const raw = Buffer.from(encoded, "base64").toString("utf8")
    return { store: asStore(JSON.parse(raw || "{}")), sha: response.data.sha }
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 404) return { store: emptyStore() }
    throw error
  }
}

async function writeGithub(store: Store, sha?: string) {
  const config = githubConfig()
  if (!config) throw new Error("GitHub file storage is not configured.")
  const octokit = new Octokit({ auth: config.token })
  await octokit.rest.repos.createOrUpdateFileContents({
    owner: config.owner,
    repo: config.repo,
    path: config.filePath,
    message: sha
      ? "Trip Expenses Balancer: update trip ledger"
      : "Trip Expenses Balancer: create trip ledger",
    content: Buffer.from(`${JSON.stringify(store)}\n`).toString("base64"),
    branch: config.branch,
    ...(sha ? { sha } : {}),
  })
}

async function load(force = false): Promise<Loaded> {
  if (!force) {
    const cached = peekFreshLoadCache()
    if (cached) return cached
  }
  const mode = storageMode()
  const loaded =
    mode === "postgres"
      ? await readPostgres()
      : mode === "github"
        ? await readGithub()
        : await readLocal()
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
  if (mode === "github") {
    await writeGithub(store, loaded.sha)
    invalidateLoadCache()
    return
  }
  await writeLocal(store)
  setLoadCache({ store })
}

export async function readStore() {
  return (await load()).store
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

export function storageErrorMessage(
  github?: GithubProbe,
  postgres?: PostgresProbe
) {
  const mode = storageMode()
  if (mode === "postgres") {
    if (postgres && !postgres.connected) return postgres.error
    return null
  }
  if (github && !github.connected) {
    if (mode === "unconfigured" || mode === "github") {
      return github.error
    }
  }
  if (mode === "unconfigured") {
    return "This Vercel deploy has no database. Add POSTGRES_URL (Supabase) or GITHUB_TOKEN for GitHub file storage."
  }
  return null
}
