import assert from "node:assert/strict"
import test from "node:test"
import { logIn, signUp } from "./auth-ops"
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

test("logIn rejects wrong password", () => {
  const created = signUp(emptyStore(), { username: "jane", password: "password123" })
  assert.throws(() =>
    logIn(created.store, { username: "jane", password: "wrongpass" })
  )
})
