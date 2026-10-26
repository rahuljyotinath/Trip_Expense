import assert from "node:assert/strict"
import test from "node:test"
import { logIn, profileNeedsSetup, signUp, updateProfile } from "./auth-ops"
import { emptyStore, publicProfile } from "./types"

test("signUp and logIn", () => {
  let store = emptyStore()
  const created = signUp(store, {
    username: "Alex",
    password: "password123",
    name: "Alex M",
  })
  store = created.store
  assert.equal(created.profile.username, "alex")
  assert.ok(created.profile.passwordHash.startsWith("scrypt$"))
  assert.equal("passwordHash" in publicProfile(created.profile), false)

  const session = logIn(store, {
    username: "alex",
    password: "password123",
  })
  assert.equal(session.profile.id, created.profile.id)
})

test("signUp rejects duplicate username", () => {
  const first = signUp(emptyStore(), { username: "sam", password: "password123" })
  assert.throws(() =>
    signUp(first.store, { username: "Sam", password: "otherpass99" })
  )
})

test("updateProfile changes display and contact fields", () => {
  const created = signUp(emptyStore(), { username: "lee", password: "password123" })
  const updated = updateProfile(created.store, {
    profileId: created.profile.id,
    name: "Lee Park",
    email: "lee@example.com",
    phone: null,
  })
  assert.equal(updated.profile.name, "Lee Park")
  assert.equal(updated.profile.email, "lee@example.com")
  assert.equal(profileNeedsSetup(updated.profile), false)
})

test("profileNeedsSetup when name matches username", () => {
  const created = signUp(emptyStore(), { username: "sam", password: "password123" })
  assert.equal(profileNeedsSetup(created.profile), true)
})

test("profileNeedsSetup false when display name differs only by case", () => {
  assert.equal(profileNeedsSetup({ username: "rahul", name: "Rahul" }), false)
})

test("logIn rejects wrong password", () => {
  const created = signUp(emptyStore(), { username: "jane", password: "password123" })
  assert.throws(() =>
    logIn(created.store, { username: "jane", password: "wrongpass" })
  )
})
