import type { Profile, Store } from "./types"

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

export function validatePassword(raw: string) {
  if (raw.length < 15 || raw.length > 1024) {
    throw new Error("Password must be 15–1024 characters. Use a unique passphrase.")
  }
  return raw
}

export function cleanDisplayName(raw: string | undefined, fallback: string) {
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


/** True until the display name is set. Contact details are optional. */
export function profileNeedsSetup(
  profile: Pick<Profile, "name" | "username" | "email" | "phone">
) {
  if (profile.name.trim() === profile.username.trim()) return true
  return false
}
