import type postgres from "postgres"

/** User-safe message when Vercel POSTGRES_URL password does not match Supabase. */
export const POSTGRES_DEPLOY_AUTH_MESSAGE =
  "The server cannot connect to the database (Postgres password rejected). In Vercel, update POSTGRES_URL from Supabase → Database → Connection string, then redeploy."

export function isSupabasePostgresUrl(url: string) {
  return /supabase\.co/i.test(url)
}

export function postgresJsOptions(url: string): postgres.Options<Record<string, postgres.PostgresType>> {
  const sslmode = url.match(/[?&]sslmode=([^&]+)/i)?.[1]?.toLowerCase()
  const needsSsl =
    sslmode === "require" ||
    sslmode === "verify-full" ||
    sslmode === "verify-ca" ||
    (isSupabasePostgresUrl(url) && !sslmode)
  return {
    max: Number(process.env.POSTGRES_POOL_MAX || 4),
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 60,
    ...(needsSsl ? { ssl: "require" as const } : {}),
  }
}

export function isPostgresPasswordAuthError(error: unknown) {
  const code = (error as { code?: string }).code
  if (code === "28P01") return true
  const message = error instanceof Error ? error.message : String(error)
  return /password authentication failed/i.test(message)
}
