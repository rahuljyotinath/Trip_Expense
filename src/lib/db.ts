import { promises as fs } from "node:fs"
import path from "node:path"
import { Octokit } from "octokit"
import { emptyStore, type StorageMode, type Store } from "@/lib/types"

const LOCAL_PATH = path.join(process.cwd(), "data", "store.json")
const DEFAULT_REMOTE_PATH = "data/store.json"

type Loaded = {
  store: Store
  sha?: string
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
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  if (!token || !repo || !repo.includes("/")) return null
  const [owner, name] = repo.split("/")
  return {
    token,
    owner,
    repo: name,
    branch: process.env.GITHUB_BRANCH || "main",
    filePath: process.env.GITHUB_DB_PATH || DEFAULT_REMOTE_PATH,
  }
}

export function storageMode(): StorageMode {
  if (githubConfig()) return "github"
  if (process.env.VERCEL) return "unconfigured"
  return "local"
}

function asStore(value: unknown): Store {
  if (!value || typeof value !== "object") return emptyStore()
  const record = value as Partial<Store>
  return {
    profiles: Array.isArray(record.profiles) ? record.profiles : [],
    groups: Array.isArray(record.groups) ? record.groups : [],
  }
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
    message: "waybill: update trip ledger",
    content: Buffer.from(`${JSON.stringify(store, null, 2)}\n`).toString("base64"),
    branch: config.branch,
    sha,
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

export function storageErrorMessage() {
  if (storageMode() === "unconfigured") {
    return "This Vercel deploy has no GitHub file database. Add GITHUB_TOKEN and GITHUB_REPO, or use this browser only."
  }
  return null
}
