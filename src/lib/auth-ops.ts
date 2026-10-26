import { hashPassword, verifyPassword } from "@/lib/auth-crypto"
import { nowIso, uid } from "@/lib/ids"
import type { Profile, Store } from "@/lib/types"

const USERNAME_RE = /^[a-zA-Z0-9._-]{2,40}$/

export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase()
}

export function validateUsername(raw: string) {
  const username = normalizeUsername(raw)
  if (!USERNAME_RE.test(username)) {
    throw new Error("Username: 2–40 characters, letters, numbers, . _ - only.")
  }
  return username
}

function validatePassword(raw: string) {
  if (raw.length < 8) {
    throw new Error("Password must be at least 8 characters.")
  }
  return raw
}

function cleanDisplayName(raw: string | undefined, fallback: string) {
  const name = (raw ?? "").replace(/\s+/g, " ").trim()
  if (!name) return fallback
  if (name.length > 40) throw new Error("Display name: 1–40 characters.")
  return name
}

export function findProfileByUsername(store: Store, rawUsername: string) {
  const username = normalizeUsername(rawUsername)
  return (
    store.profiles.find((item) => normalizeUsername(item.username) === username) ??
    null
  )
}

export function signUp(
  store: Store,
  input: { username: string; password: string; name?: string }
) {
  const username = validateUsername(input.username)
  validatePassword(input.password)
  if (findProfileByUsername(store, username)) {
    throw new Error("That username is taken.")
  }
  const name = cleanDisplayName(input.name, username)
  const profile: Profile = {
    id: uid("p"),
    username,
    passwordHash: hashPassword(input.password),
    name,
    email: null,
    phone: null,
    createdAt: nowIso(),
  }
  return {
    store: { ...store, profiles: [...store.profiles, profile] },
    profile,
  }
}

export function logIn(
  store: Store,
  input: { username: string; password: string }
) {
  const username = normalizeUsername(input.username)
  const profile = findProfileByUsername(store, username)
  if (!profile || !profile.passwordHash) {
    throw new Error("Unknown username or wrong password.")
  }
  const ok = verifyPassword(input.password, profile.passwordHash)
  if (!ok) {
    throw new Error("Unknown username or wrong password.")
  }
  return { store, profile }
}

export function profileFromId(store: Store, profileId: string): Profile | null {
  const profile = store.profiles.find((item) => item.id === profileId)
  return profile ?? null
}
