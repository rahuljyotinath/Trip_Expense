#!/usr/bin/env node
/**
 * Set Preview-scoped env vars on trip-expense-balancer (never Production).
 * Usage:
 *   node scripts/set-vercel-preview-env.mjs \
 *     --postgres "$FRIEND_POSTGRES_URL" \
 *     --app-url "https://....vercel.app"
 * Reads token from Vercel CLI auth.json.
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { randomBytes } from "node:crypto"

const TEAM_ID = "team_DIsBeyR5bvbfBqE8n5shAT9K"
const PROJECT_ID = "prj_9989K3KXiBQRWQQ0eoXQ53AJpGN9"

function parseArgs() {
  const args = process.argv.slice(2)
  let postgres = process.env.FRIEND_POSTGRES_URL?.trim() || ""
  let appUrl = process.env.PREVIEW_APP_URL?.trim() || ""
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--postgres") postgres = args[++i] ?? ""
    if (args[i] === "--app-url") appUrl = args[++i] ?? ""
  }
  return { postgres, appUrl }
}

function vercelToken() {
  const path = join(homedir(), "Library/Application Support/com.vercel.cli/auth.json")
  const raw = JSON.parse(readFileSync(path, "utf8"))
  if (!raw.token) throw new Error("Vercel CLI not logged in. Run: npx vercel login")
  return raw.token
}

async function upsertEnv(token, key, value, type = "encrypted") {
  const base = `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`
  const list = await fetch(base, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  const existing = (list.envs ?? []).find(
    (e) => e.key === key && (e.target ?? []).includes("preview")
  )
  const body = {
    key,
    value,
    type,
    target: ["preview"],
  }
  if (existing?.id) {
    const res = await fetch(`${base.replace("/env?", `/env/${existing.id}?`)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value, type, target: ["preview"] }),
    })
    if (!res.ok) throw new Error(`PATCH ${key}: ${await res.text()}`)
    return "updated"
  }
  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${key}: ${await res.text()}`)
  return "created"
}

async function main() {
  const { postgres, appUrl } = parseArgs()
  if (!postgres) {
    console.error("Missing friend Postgres URL. Set FRIEND_POSTGRES_URL or --postgres")
    process.exit(1)
  }
  if (!appUrl) {
    console.error("Missing preview URL. Set PREVIEW_APP_URL or --app-url")
    process.exit(1)
  }
  const sessionSecret = randomBytes(32).toString("base64")
  const token = vercelToken()
  for (const [key, value] of [
    ["POSTGRES_URL", postgres],
    ["SESSION_SECRET", sessionSecret],
    ["NEXT_PUBLIC_APP_URL", appUrl.replace(/\/$/, "")],
  ]) {
    const action = await upsertEnv(token, key, value)
    console.log(`${key}: ${action}`)
  }
  console.log("Redeploy the latest Preview deployment in Vercel for changes to apply.")
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
