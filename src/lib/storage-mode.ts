import { resolveGithubTarget } from "./github-target"
import type { StorageMode } from "./types"

export function postgresConfig() {
  const url =
    process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim() || ""
  return url || null
}

export function githubConfig() {
  const token = process.env.GITHUB_TOKEN?.trim()
  if (!token) return null
  const target = resolveGithubTarget()
  if (!target.owner || !target.repo) return null
  return { token, ...target }
}

export function storageMode(): StorageMode {
  if (postgresConfig()) return "postgres"
  if (githubConfig()) return "github"
  if (process.env.VERCEL) return "unconfigured"
  return "local"
}
