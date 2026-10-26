import assert from "node:assert/strict"
import test from "node:test"
import { normalizeGroup, normalizeProfile, publicProfile } from "./types"

test("normalizeGroup defaults missing trip dates", () => {
  const persisted = {
    id: "g1",
    name: "Old",
    code: "ABCDEF",
    currency: "INR",
    createdByProfileId: "p1",
    createdAt: "2026-01-01T00:00:00.000Z",
    members: [],
    expenses: [],
    payments: [],
  }
  const group = normalizeGroup(persisted as unknown as Parameters<typeof normalizeGroup>[0])
  assert.equal(group.startDate, null)
  assert.equal(group.endDate, null)
})

test("publicProfile strips passwordHash", () => {
  const profile = normalizeProfile({
    id: "p1",
    username: "u",
    passwordHash: "scrypt$16384$8$1$salt$hash",
    name: "U",
    email: null,
    phone: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  })
  const pub = publicProfile(profile)
  assert.equal("passwordHash" in pub, false)
  assert.equal(pub.username, "u")
})
