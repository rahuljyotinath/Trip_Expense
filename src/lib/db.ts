import { promises as fs } from "node:fs"
import path from "node:path"
import { Octokit } from "octokit"
import { emptyStore, normalizeStore, type StorageMode, type Store } from "./types"
import {
  githubUrl,
  resolveGithubTarget,
  type GithubTarget,
} from "./github-target"

export { DEFAULT_GITHUB_REPO, resolveGithubTarget } from "./github-target"

const LOCAL_PATH = path.join(process.cwd(), "data", "store.json")

type Loaded = {
  store: Store
  sha?: string
}

export type GithubProbe = GithubTarget & {
  connected: boolean
  githubUrl: string
  sha?: string
  error: string | null
}

let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(job: () => Promise<T>) {
  const run = queue.then(job, job)
  queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function githubConfig() {
  const token = process.env.GITHUB_TOKEN?.trim()
  if (!token) return null
  const target = resolveGithubTarget()
  if (!target.owner || !target.repo) return null
  return { token, ...target }
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

export function storageMode(): StorageMode {
  if (githubConfig()) return "github"
  if (process.env.VERCEL) return "unconfigured"
  return "local"
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

  try {
    const loaded = await readGithub()
    if (loaded.sha) {
      return { ...base, connected: true, sha: loaded.sha, error: null }
    }
    await writeGithub(loaded.store)
    const created = await readGithub()
    return { ...base, connected: true, sha: created.sha, error: null }
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 404 || status === 409) {
      try {
        await writeGithub(emptyStore())
        const created = await readGithub()
        return { ...base, connected: true, sha: created.sha, error: null }
      } catch (writeError) {
        return { ...base, error: githubErrorMessage(writeError) }
      }
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
    message: sha ? "waybill: update trip ledger" : "waybill: create trip ledger",
    content: Buffer.from(`${JSON.stringify(store, null, 2)}\n`).toString("base64"),
    branch: config.branch,
    ...(sha ? { sha } : {}),
  })
}

async function load(): Promise<Loaded> {
  return storageMode() === "github" ? readGithub() : readLocal()
}

async function save(store: Store, sha?: string) {
  if (storageMode() === "github") {
    await writeGithub(store, sha)
    return
  }
  await writeLocal(store)
}

export async function readStore() {
  return enqueue(async () => (await load()).store)
}

export async function updateStore<T>(mutator: (store: Store) => T) {
  return enqueue(async () => {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const loaded = await load()
      const result = mutator(loaded.store)
      const next =
        result && typeof result === "object" && "store" in result
          ? (result as { store: Store }).store
          : loaded.store
      try {
        await save(next, loaded.sha)
        return result
      } catch (error) {
        lastError = error
        const status = (error as { status?: number }).status
        if (status !== 409 && status !== 422) throw error
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not save the ledger.")
  })
}

export function storageErrorMessage(probe?: GithubProbe) {
  if (probe && !probe.connected) {
    if (storageMode() === "unconfigured" || storageMode() === "github") {
      return probe.error
    }
  }
  if (storageMode() === "unconfigured") {
    return `This Vercel deploy has no GitHub file database. Add GITHUB_TOKEN for ${resolveGithubTarget().fullName}, or use this browser only.`
  }
  return null
}
