#!/usr/bin/env node
/**
 * Detach Preview from Production Supabase vars; set Preview-only DB + auth.
 * Usage:
 *   node scripts/split-vercel-preview-db.mjs --postgres "$FRIEND_POSTGRES_URL" \
 *     --app-url "https://....vercel.app"
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { randomBytes } from "node:crypto"

const TEAM_ID = "team_DIsBeyR5bvbfBqE8n5shAT9K"
const PROJECT_ID = "prj_9989K3KXiBQRWQQ0eoXQ53AJpGN9"

const PROD_ONLY_KEYS = new Set([
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_HOST",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DATABASE",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
])

function vercelToken() {
  const path = join(homedir(), "Library/Application Support/com.vercel.cli/auth.json")
  const raw = JSON.parse(readFileSync(path, "utf8"))
  if (!raw.token) throw new Error("Vercel CLI not logged in")
  return raw.token
}

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

async function listEnvs(token) {
  const url = `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(data))
  return data.envs ?? []
}

async function patchEnv(token, id, body) {
  const url = `https://api.vercel.com/v10/projects/${PROJECT_ID}/env/${id}?teamId=${TEAM_ID}`
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
}

async function createEnv(token, body) {
  const url = `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
}

async function main() {
  const { postgres, appUrl } = parseArgs()
  if (!postgres) {
    console.error("Set FRIEND_POSTGRES_URL or --postgres (friend Supabase URI after provision)")
    process.exit(1)
  }
  if (!appUrl) {
    console.error("Set PREVIEW_APP_URL or --app-url")
    process.exit(1)
  }

  const token = vercelToken()
  const envs = await listEnvs(token)
  const sessionSecret = randomBytes(32).toString("base64")

  for (const env of envs) {
    const targets = env.target ?? []
    if (!PROD_ONLY_KEYS.has(env.key)) continue
    if (!targets.includes("preview")) continue
    const next = targets.filter((t) => t !== "preview")
    if (next.length === 0) continue
    await patchEnv(token, env.id, { target: next })
    console.log(`${env.key}: preview removed (production only now)`)
  }

  const previewKeys = {
    POSTGRES_URL: postgres,
    SESSION_SECRET: sessionSecret,
    NEXT_PUBLIC_APP_URL: appUrl.replace(/\/$/, ""),
  }

  for (const [key, value] of Object.entries(previewKeys)) {
    const existing = envs.find(
      (e) => e.key === key && (e.target ?? []).includes("preview")
    )
    const envType = key === "POSTGRES_URL" ? "sensitive" : "encrypted"
    if (existing?.id) {
      await patchEnv(token, existing.id, {
        value,
        target: ["preview"],
      })
      console.log(`${key}: preview updated`)
    } else {
      await createEnv(token, {
        key,
        value,
        type: envType,
        target: ["preview"],
      })
      console.log(`${key}: preview created`)
    }
  }

  console.log("Done. Redeploy Preview for features/security.")
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
