import { createHash, randomBytes } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { storageMode } from "./storage-mode"

type SecurityState = {
  sessions: Record<string, { profileId: string; expiresAt: number }>
  limits: Record<string, { attempts: number; expiresAt: number }>
  recovery: Record<string, string>
}
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex")
let queue: Promise<unknown> = Promise.resolve()

async function local<T>(job: (state: SecurityState) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const file = path.join(process.env.TRIPZY_DATA_DIR || path.join(process.cwd(), "data"), "security.json")
    let state: SecurityState = { sessions: {}, limits: {}, recovery: {} }
    try { state = JSON.parse(await fs.readFile(file, "utf8")) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    const now = Date.now()
    for (const [id, row] of Object.entries(state.sessions)) if (row.expiresAt <= now) delete state.sessions[id]
    for (const [id, row] of Object.entries(state.limits)) if (row.expiresAt <= now) delete state.limits[id]
    const result = await job(state)
    await fs.mkdir(path.dirname(file), { recursive: true })
    const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`
    await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600 })
    await fs.rename(temporary, file)
    return result
  })
  queue = run.catch(() => undefined)
  return run
}

async function sql() {
  if (storageMode() === "unconfigured") throw new Error("Security storage is unavailable.")
  return storageMode() === "postgres" ? (await import("./db")).getSql() : null
}

export async function registerSession(token: string, profileId: string, expiresAt: number) {
  const db = await sql(); const id = fingerprint(token)
  if (db) {
    await db`DELETE FROM auth_sessions WHERE expires_at <= now()`
    await db`INSERT INTO auth_sessions(id, profile_id, expires_at) VALUES (${id}, ${profileId}, ${new Date(expiresAt).toISOString()})`
  } else await local((state) => { state.sessions[id] = { profileId, expiresAt } })
}

export async function activeSessionProfile(token: string): Promise<string | null> {
  const db = await sql(); const id = fingerprint(token)
  if (db) {
    const rows = await db<{ profile_id: string }[]>`SELECT profile_id FROM auth_sessions WHERE id = ${id} AND expires_at > now()`
    return rows[0]?.profile_id ?? null
  }
  return local((state) => state.sessions[id]?.profileId ?? null)
}

export async function revokeSession(token: string) {
  const db = await sql(); const id = fingerprint(token)
  if (db) await db`DELETE FROM auth_sessions WHERE id = ${id}`
  else await local((state) => { delete state.sessions[id] })
}

export async function revokeProfileSessions(profileId: string) {
  const db = await sql()
  if (db) await db`DELETE FROM auth_sessions WHERE profile_id = ${profileId}`
  else await local((state) => { for (const [id, row] of Object.entries(state.sessions)) if (row.profileId === profileId) delete state.sessions[id] })
}

/** Atomic counters in Postgres are shared across server instances. */
export async function consumeRateLimit(key: string, max: number, seconds: number): Promise<boolean> {
  const db = await sql(); const id = fingerprint(key)
  if (db) {
    const rows = await db<{ attempts: number }[]>`
      INSERT INTO auth_rate_limits(id, attempts, expires_at) VALUES (${id}, 1, now() + ${seconds} * interval '1 second')
      ON CONFLICT(id) DO UPDATE SET
        attempts = CASE WHEN auth_rate_limits.expires_at <= now() THEN 1 ELSE LEAST(auth_rate_limits.attempts + 1, ${max + 1}) END,
        expires_at = CASE WHEN auth_rate_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END
      RETURNING attempts`
    return rows[0].attempts <= max
  }
  return local((state) => {
    const row = state.limits[id] ?? { attempts: 0, expiresAt: Date.now() + seconds * 1000 }
    row.attempts = Math.min(row.attempts + 1, max + 1); state.limits[id] = row
    return row.attempts <= max
  })
}

export async function issueRecoveryCode(profileId: string) {
  const code = randomBytes(32).toString("base64url"); const hash = fingerprint(code); const db = await sql()
  if (db) await db`INSERT INTO auth_recovery_codes(profile_id, code_hash) VALUES (${profileId}, ${hash}) ON CONFLICT(profile_id) DO UPDATE SET code_hash = EXCLUDED.code_hash`
  else await local((state) => { state.recovery[profileId] = hash })
  return code
}

export async function consumeRecoveryCode(profileId: string, code: string) {
  const db = await sql(); const hash = fingerprint(code)
  if (db) {
    const rows = await db`DELETE FROM auth_recovery_codes WHERE profile_id = ${profileId} AND code_hash = ${hash} RETURNING profile_id`
    return rows.length === 1
  }
  return local((state) => { if (state.recovery[profileId] !== hash) return false; delete state.recovery[profileId]; return true })
}
