import assert from "node:assert/strict"
import test from "node:test"
import { profileIdsForTripContext } from "./trip-get-context"
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
    adminProfileIds: [],
    expenses: [],
    payments: [],
    ...partial,
  }
}

test("profileIdsForTripContext includes roster, session, and join requests for trip", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
    ],
  })
  const joinRequests = [
    {
      id: "jr1",
      groupId: "g1",
      profileId: "p3",
      status: "pending" as const,
      createdAt: "2026-01-02T00:00:00.000Z",
      decidedAt: null,
      decidedByProfileId: null,
    },
    {
      id: "jr2",
      groupId: "g_other",
      profileId: "p9",
      status: "pending" as const,
      createdAt: "2026-01-02T00:00:00.000Z",
      decidedAt: null,
      decidedByProfileId: null,
    },
  ]
  const ids = profileIdsForTripContext(g, joinRequests, "p_viewer")
  assert.deepEqual(new Set(ids), new Set(["p_viewer", "p1", "p2", "p3"]))
})
