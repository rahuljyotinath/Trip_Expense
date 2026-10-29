import { hashPassword, verifyPassword } from "@/lib/auth-crypto"
import { validateUpiId } from "@/lib/upi"
import { nowIso, uid } from "@/lib/ids"
import type { Profile, Store } from "@/lib/types"

import { validateUsername, validatePassword, cleanDisplayName, findProfileByUsername, normalizeUsername } from "./auth-validation"
export { validateUsername, validatePassword, findProfileByUsername, normalizeUsername, profileNeedsSetup } from "./auth-validation"

export function signUp(
  store: Store,
  input: { username: string; password: string; name?: string },
  preparedHash?: string
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
    passwordHash: preparedHash ?? hashPassword(input.password),
    name,
    email: null,
    phone: null,
    upiId: null,
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
  return { store, profile: assertProfilePassword(profile, input.password) }
}

/** Login when the profile row is already loaded (indexed DB lookup). */
export function logInWithProfile(
  profile: Profile | null,
  input: { username: string; password: string }
) {
  normalizeUsername(input.username)
  return { profile: assertProfilePassword(profile, input.password) }
}

function assertProfilePassword(profile: Profile | null, password: string) {
  if (!profile || !profile.passwordHash) {
    throw new Error("Unknown username or wrong password.")
  }
  if (!verifyPassword(password, profile.passwordHash)) {
    throw new Error("Unknown username or wrong password.")
  }
  return profile
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
    upiId?: string | null
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
  const upiId =
    input.upiId !== undefined
      ? validateUpiId(input.upiId)
      : current.upiId ?? null
  const profile: Profile = { ...current, name, email, phone, upiId }
  const profiles = store.profiles.slice()
  profiles[index] = profile
  return { store: { ...store, profiles }, profile }
}
