import assert from "node:assert/strict"
import test from "node:test"
import { storesEqual } from "./store-compare"
import { emptyStore } from "./types"

test("storesEqual compares normalized store snapshots", () => {
  const a = emptyStore()
  const b = emptyStore()
  assert.equal(storesEqual(a, b), true)
  b.profiles.push({
    id: "p1",
    username: "u",
    passwordHash: "h",
    name: "U",
    email: null,
    phone: null,
    upiId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  })
  assert.equal(storesEqual(a, b), false)
})
