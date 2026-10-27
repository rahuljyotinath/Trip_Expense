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
  if (raw.length < 5) {
    throw new Error("Password must be at least 5 characters.")
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

function cleanOptionalContact(raw: string | undefined | null) {
  const value = (raw ?? "").trim()
  return value ? value : null
}

export function validateContactEmail(raw: string) {
  const email = raw.trim()
  if (!email || !email.includes("@") || email.length < 5) {
    throw new Error("Enter a valid email address.")
  }
  if (email.length > 120) throw new Error("Email is too long.")
  return email
}

export function validateContactPhone(raw: string) {
  const phone = raw.trim()
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 10) {
    throw new Error("Enter a valid phone number (at least 10 digits).")
  }
  if (phone.length > 20) throw new Error("Phone number is too long.")
  return phone
}

export function updateProfile(
  store: Store,
  input: {
    profileId: string
    name?: string
    email?: string | null
    phone?: string | null
  }
) {
  const index = store.profiles.findIndex((item) => item.id === input.profileId)
  if (index === -1) throw new Error("Profile not found.")
  const current = store.profiles[index]!
  const name =
    input.name !== undefined
      ? cleanDisplayName(input.name, current.username)
      : current.name
  let email = input.email !== undefined ? cleanOptionalContact(input.email) : current.email
  let phone = input.phone !== undefined ? cleanOptionalContact(input.phone) : current.phone
  if (input.email !== undefined && email) {
    email = validateContactEmail(email)
  }
  if (input.phone !== undefined && phone) {
    phone = validateContactPhone(phone)
  }
  if (input.email !== undefined && !email) {
    throw new Error("Email is required.")
  }
  if (input.phone !== undefined && !phone) {
    throw new Error("Phone is required.")
  }
  const profile: Profile = { ...current, name, email, phone }
  const profiles = store.profiles.slice()
  profiles[index] = profile
  return { store: { ...store, profiles }, profile }
}

/** True until display name, email, and phone are complete. */
export function profileNeedsSetup(
  profile: Pick<Profile, "name" | "username" | "email" | "phone">
) {
  if (profile.name.trim() === profile.username.trim()) return true
  if (!profile.email?.trim()) return true
  if (!profile.phone?.trim()) return true
  return false
}
