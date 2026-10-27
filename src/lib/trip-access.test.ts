import assert from "node:assert/strict"
import test from "node:test"
import { canViewGroup, isGroupMember } from "./trip-access"
import type { Group } from "./types"

function group(partial: Partial<Group> & Pick<Group, "members">): Group {
  return {
    id: "g1",
    name: "Trip",
    code: "ABCD",
    currency: "INR",
    startDate: null,
    endDate: null,
    createdByProfileId: "p_creator",
    createdAt: "2026-01-01T00:00:00.000Z",
    expenses: [],
    payments: [],
    ...partial,
  }
}

test("isGroupMember when profile linked on roster", () => {
  const g = group({
    members: [{ id: "m1", name: "A", profileId: "p1", coveredByMemberId: null }],
  })
  assert.equal(isGroupMember("p1", g), true)
  assert.equal(isGroupMember("p2", g), false)
})

test("canViewGroup for creator and member", () => {
  const g = group({
    members: [{ id: "m1", name: "A", profileId: "p1", coveredByMemberId: null }],
  })
  assert.equal(canViewGroup("p_creator", g), true)
  assert.equal(canViewGroup("p1", g), true)
  assert.equal(canViewGroup("p_stranger", g), false)
})

test("canViewGroup with matching join code", () => {
  const g = group({
    code: "wxyz",
    members: [{ id: "m1", name: "A", profileId: null, coveredByMemberId: null }],
  })
  assert.equal(canViewGroup("p_stranger", g, { joinCode: "wxyz" }), true)
  assert.equal(canViewGroup("p_stranger", g, { joinCode: "WXYZ" }), true)
  assert.equal(canViewGroup("p_stranger", g, { joinCode: "bad" }), false)
})
