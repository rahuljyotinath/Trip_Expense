import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto"

const SESSION_COOKIE = "teb_session"
const SESSION_TTL_SEC = 60 * 60 * 24 * 30
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64

function sessionSecretFromGithubToken(token: string) {
  return createHmac("sha256", "teb-session-v1").update(token).digest("hex")
}

function secret() {
  const explicit = process.env.SESSION_SECRET?.trim()
  if (explicit) return explicit
  const github = process.env.GITHUB_TOKEN?.trim()
  if (github) return sessionSecretFromGithubToken(github)
  if (process.env.NODE_ENV === "production") {
    throw new Error("Set SESSION_SECRET or GITHUB_TOKEN for sign-in sessions.")
  }
  return "dev-only-session-secret"
}

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`
}

export function verifyPassword(password: string, stored: string) {
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = parts[4]
  const hashB64 = parts[5]
  if (!salt || !hashB64 || !Number.isFinite(n)) return false
  const expected = Buffer.from(hashB64, "base64url")
  const derived = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, {
    N: n,
    r,
    p,
  })
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

type SessionPayload = {
  profileId: string
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
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  }
  return signPayload(payload)
}

export function readSessionToken(token: string | undefined | null) {
  if (!token) return null
  const [body, sig] = token.split(".")
  if (!body || !sig) return null
  const expected = createHmac("sha256", secret()).update(body).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload
    if (!payload.profileId || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload.profileId
  } catch {
    return null
  }
}

export const sessionCookie = {
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SEC,
}
