/**
 * One-time import of ledger JSON into Supabase Postgres.
 *
 *   POSTGRES_URL=... npx tsx scripts/import-ledger-to-postgres.ts
 *
 * Source: data/store.json, or GitHub store.json when GITHUB_TOKEN is set.
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { Octokit } from "octokit"
import postgres from "postgres"
import { resolveGithubTarget } from "../src/lib/github-target"
import { emptyStore, normalizeStore, type Store } from "../src/lib/types"

const LEDGER_ROW_ID = "main"
const LOCAL_PATH = path.join(process.cwd(), "data", "store.json")

function asStore(value: unknown): Store {
  if (!value || typeof value !== "object") return emptyStore()
  const record = value as Partial<Store>
  return normalizeStore({
    profiles: Array.isArray(record.profiles) ? record.profiles : [],
    groups: Array.isArray(record.groups) ? record.groups : [],
  })
}

async function loadFromLocal() {
  const raw = await fs.readFile(LOCAL_PATH, "utf8")
  return asStore(JSON.parse(raw))
}

async function loadFromGithub() {
  const token = process.env.GITHUB_TOKEN?.trim()
  if (!token) return null
  const target = resolveGithubTarget()
  const octokit = new Octokit({ auth: token })
  const response = await octokit.rest.repos.getContent({
    owner: target.owner,
    repo: target.repo,
    path: target.filePath,
    ref: target.branch,
  })
  if (Array.isArray(response.data) || response.data.type !== "file") {
    throw new Error("GitHub path is not a file.")
  }
  const encoded = response.data.content.replace(/\n/g, "")
  const raw = Buffer.from(encoded, "base64").toString("utf8")
  return asStore(JSON.parse(raw || "{}"))
}

async function main() {
  const url =
    process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim() || ""
  if (!url) {
    console.error("Set POSTGRES_URL or DATABASE_URL.")
    process.exit(1)
  }

  let store: Store
  try {
    store = (await loadFromGithub()) ?? (await loadFromLocal())
  } catch (error) {
    console.error("Could not load source ledger:", error)
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
    `Imported ${store.profiles.length} profiles, ${store.groups.length} groups (version ${rows[0]?.version ?? "?"}).`
  )
  await sql.end({ timeout: 5 })
}

void main()
