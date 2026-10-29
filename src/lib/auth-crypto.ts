import {
  createHmac,
  randomBytes,
  scryptSync,
  scrypt,
  timingSafeEqual,
} from "node:crypto"

const SESSION_COOKIE = "teb_session"
const SESSION_TTL_SEC = 60 * 60 * 24 * 30
const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 3
const KEY_LEN = 64

/** Production must use an independent random secret; rotating it invalidates all tokens. */
export function resolveSessionSecret(): string {
  const explicit = process.env.SESSION_SECRET?.trim()
  if (explicit && (process.env.NODE_ENV !== "production" || Buffer.byteLength(explicit) >= 32)) return explicit
  if (process.env.NODE_ENV !== "production") return "dev-only-session-secret"
  throw new Error("Set SESSION_SECRET to at least 32 random bytes for sign-in sessions.")
}

function secret() {
  return resolveSessionSecret()
}

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`
}

function passwordParts(stored: string) {
  const parts = stored.split("$")
  const n = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3])
  const salt = Buffer.from(parts[4] ?? "", "base64url"), expected = Buffer.from(parts[5] ?? "", "base64url")
  if (parts.length !== 6 || parts[0] !== "scrypt" || !Number.isInteger(n) || n < 16384 || n > 131072 || (n & (n - 1)) || r !== 8 || ![1, 2, 3].includes(p) || salt.length !== 16 || expected.length !== KEY_LEN) return null
  return { n, r, p, salt, expected }
}

export function verifyPassword(password: string, stored: string) {
  const values = passwordParts(stored)
  if (!values || password.length > 1024) return false
  try {
    const derived = scryptSync(password, values.salt, KEY_LEN, { N: values.n, r: values.r, p: values.p, maxmem: 256 * 1024 * 1024 })
    return timingSafeEqual(derived, values.expected)
  } catch { return false }
}

function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, KEY_LEN, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)))
}

export async function hashPasswordAsync(password: string) {
  const salt = randomBytes(16)
  const derived = await derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`
}

export async function verifyPasswordAsync(password: string, stored: string) {
  const values = passwordParts(stored)
  if (!values || password.length > 1024) return false
  const derived = await derive(password, values.salt, values.n, values.r, values.p)
  return timingSafeEqual(derived, values.expected)
}

type SessionPayload = {
  profileId: string
  sid: string
  exp: number
}

function signPayload(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = createHmac("sha256", secret()).update(body).digest("base64url")
  return `${body}.${sig}`
}

export function createSessionToken(profileId: string) {
  const payload: SessionPayload = {
    profileId,
    sid: randomBytes(32).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  }
  return signPayload(payload)
}

export function readSessionPayload(token: string | undefined | null) {
  if (!token || token.length > 2048 || token.split(".").length !== 2) return null
  const [body, sig] = token.split(".")
  if (!body || !sig) return null
  const expected = createHmac("sha256", secret()).update(body).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload
    if (typeof payload.profileId !== "string" || !payload.profileId || typeof payload.sid !== "string" || payload.sid.length !== 43 || !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function readSessionToken(token: string | null | undefined) { return readSessionPayload(token)?.profileId ?? null }

export const sessionCookie = {
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SEC,
}
