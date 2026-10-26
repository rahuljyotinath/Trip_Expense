import type { StorageMode } from "./types"

export function postgresConfig() {
  const url =
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    ""
  return url || null
}

export function storageMode(): StorageMode {
  if (postgresConfig()) return "postgres"
  if (process.env.VERCEL) return "unconfigured"
  return "local"
}
