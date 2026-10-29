#!/usr/bin/env node
/**
 * Create a new Supabase project for friend preview, provision schema, wire Vercel Preview.
 *
 * Requires: SUPABASE_ACCESS_TOKEN from https://supabase.com/dashboard/account/tokens
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/create-supabase-friend-project.mjs
 */
import { randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const PROJECT_NAME = "Tripzy_Development"
const REGION = process.env.SUPABASE_REGION?.trim() || "ap-south-1"
const PREVIEW_APP_URL =
  process.env.PREVIEW_APP_URL?.trim() ||
  "https://trip-expense-balancer-git-6abe49-rahuljyotinath-8458s-projects.vercel.app"

function token() {
  const t = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  if (!t) {
    console.error(
      "Set SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens → Generate)."
    )
    process.exit(1)
  }
  return t
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text }
  }
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`)
  return body
}

async function waitHealthy(ref, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    const p = await api(`/projects/${ref}`)
    if (p.status === "ACTIVE_HEALTHY") return p
    console.log(`Waiting for project (${p.status ?? "unknown"})…`)
    await new Promise((r) => setTimeout(r, 10_000))
  }
  throw new Error("Project did not become ACTIVE_HEALTHY in time")
}

function postgresUri(ref, password) {
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`
}

async function main() {
  const orgs = await api("/organizations")
  const org = orgs[0]
  if (!org?.id) throw new Error("No Supabase organization on this account")
  console.log(`Using org: ${org.name ?? org.id}`)

  const dbPass = randomBytes(24).toString("base64url")
  const created = await api("/projects", {
    method: "POST",
    body: JSON.stringify({
      organization_id: org.id,
      name: PROJECT_NAME,
      db_pass: dbPass,
      region: REGION,
    }),
  })

  const ref = created.id ?? created.ref
  if (!ref) throw new Error(`Unexpected create response: ${JSON.stringify(created)}`)

  console.log(`Created project ref: ${ref}`)
  const project = await waitHealthy(ref)
  const postgresUrl = postgresUri(ref, dbPass)
  console.log("Provisioning schema…")
  const prov = spawnSync(
    "bash",
    ["-c", `FRIEND_POSTGRES_URL='${postgresUrl.replace(/'/g, "'\\''")}' ./scripts/provision-friend-database.sh`],
    { cwd: process.cwd(), stdio: "inherit", env: process.env }
  )
  if (prov.status !== 0) process.exit(prov.status ?? 1)

  console.log("Updating Vercel Preview env…")
  const split = spawnSync(
    "node",
    [
      "scripts/split-vercel-preview-db.mjs",
      "--postgres",
      postgresUrl,
      "--app-url",
      PREVIEW_APP_URL,
    ],
    { cwd: process.cwd(), stdio: "inherit", env: process.env }
  )
  if (split.status !== 0) process.exit(split.status ?? 1)

  const outPath = join(process.cwd(), ".scratch/friend-supabase-connection.env")
  const lines = [
    `# Friend preview Supabase — ${new Date().toISOString()}`,
    `# Project ref: ${ref}`,
    `FRIEND_POSTGRES_URL=${postgresUrl}`,
    `SUPABASE_PROJECT_REF=${ref}`,
    `# DB password (store in password manager): ${dbPass}`,
  ]
  await import("node:fs/promises").then((fs) =>
    fs.mkdir(join(process.cwd(), ".scratch"), { recursive: true }).then(() =>
      fs.writeFile(outPath, lines.join("\n") + "\n", { mode: 0o600 })
    )
  )
  console.log(`Wrote ${outPath} (gitignored via .env* pattern — keep private)`)
  console.log("Redeploy Vercel Preview for features/security.")
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
