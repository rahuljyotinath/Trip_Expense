import assert from "node:assert/strict"
import test from "node:test"
import { profileIdsForTripMutation } from "./ledger-repository"
import { normalizeGroup } from "./types"

test("profileIdsForTripMutation always includes session profile", () => {
  const group = normalizeGroup({
    id: "t1",
    name: "Trip",
    code: "ABCD",
    currency: "INR",
    startDate: null,
    endDate: null,
    createdByProfileId: "p_creator",
    createdAt: "2026-01-01",
    members: [
      { id: "m1", name: "Alex", profileId: "p_seated", coveredByMemberId: null },
    ],
    expenses: [],
    payments: [],
  })
  const ids = profileIdsForTripMutation(group, "t1", [], [], "p_viewer")
  assert.ok(ids.includes("p_viewer"))
  assert.ok(ids.includes("p_creator"))
  assert.ok(ids.includes("p_seated"))
})

test("profileIdsForTripMutation with empty group still includes session", () => {
  const ids = profileIdsForTripMutation(null, "t1", [], [], "p_session")
  assert.deepEqual(ids, ["p_session"])
})
