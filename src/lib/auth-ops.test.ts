import assert from "node:assert/strict"
import test from "node:test"
import {
  logIn,
  logInWithProfile,
  profileNeedsSetup,
  signUp,
  updateProfile,
} from "./auth-ops"
import { emptyStore, publicProfile } from "./types"

test("signUp and logIn", () => {
  let store = emptyStore()
  const created = signUp(store, {
    username: "Alex",
    password: "a unique test passphrase 123",
    name: "Alex M",
  })
  store = created.store
  assert.equal(created.profile.username, "alex")
  assert.ok(created.profile.passwordHash.startsWith("scrypt$"))
  assert.equal("passwordHash" in publicProfile(created.profile), false)

  const session = logIn(store, {
    username: "alex",
    password: "a unique test passphrase 123",
  })
  assert.equal(session.profile.id, created.profile.id)
})

test("signUp rejects duplicate username", () => {
  const first = signUp(emptyStore(), { username: "sam", password: "a unique test passphrase 123" })
  assert.throws(() =>
    signUp(first.store, { username: "Sam", password: "another unique passphrase 99" })
  )
})

test("updateProfile changes display and contact fields", () => {
  const created = signUp(emptyStore(), { username: "lee", password: "a unique test passphrase 123" })
  const updated = updateProfile(created.store, {
    profileId: created.profile.id,
    name: "Lee Park",
    email: "lee@example.com",
    phone: "+91 9876543210",
  })
  assert.equal(updated.profile.name, "Lee Park")
  assert.equal(updated.profile.email, "lee@example.com")
  assert.equal(profileNeedsSetup(updated.profile), false)
})

test("profileNeedsSetup when name matches username", () => {
  const created = signUp(emptyStore(), { username: "sam", password: "a unique test passphrase 123" })
  assert.equal(profileNeedsSetup(created.profile), true)
})

test("profileNeedsSetup false when display name differs only by case", () => {
  assert.equal(
    profileNeedsSetup({
      username: "rahul",
      name: "Rahul",
      email: "r@example.com",
      phone: "+919876543210",
    }),
    false
  )
})

test("profileNeedsSetup allows omitted contact details", () => {
  assert.equal(
    profileNeedsSetup({
      username: "sam",
      name: "Sam Lee",
      email: null,
      phone: "+919876543210",
    }),
    false
  )
})

test("logIn rejects wrong password", () => {
  const created = signUp(emptyStore(), { username: "jane", password: "a unique test passphrase 123" })
  assert.throws(() =>
    logIn(created.store, { username: "jane", password: "wrongpass" })
  )
})

test("logInWithProfile matches logIn for loaded row", () => {
  const created = signUp(emptyStore(), { username: "jane", password: "a unique test passphrase 123" })
  const session = logInWithProfile(created.profile, {
    username: "jane",
    password: "a unique test passphrase 123",
  })
  assert.equal(session.profile.id, created.profile.id)
})

test("logIn works with profiles-only store shape", () => {
  const created = signUp(emptyStore(), { username: "pat", password: "a unique test passphrase 123" })
  const profilesOnly = { profiles: created.store.profiles, groups: [] }
  const session = logIn(profilesOnly, {
    username: "pat",
    password: "a unique test passphrase 123",
  })
  assert.equal(session.profile.id, created.profile.id)
})
