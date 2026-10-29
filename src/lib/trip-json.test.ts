import assert from "node:assert/strict"
import test from "node:test"
import { exportTripJson, parseTripJson } from "./trip-json"
import { importTripCsv } from "./operations"
import type { Group } from "./types"

function sampleGroup(): Group {
  return {
    id: "g1",
    name: "Goa",
    code: "ABCDEF",
    currency: "INR",
    startDate: "2026-01-01",
    endDate: "2026-01-07",
    createdByProfileId: "p1",
    createdAt: "2026-01-01T00:00:00.000Z",
    members: [
      { id: "m1", name: "Priya", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "Aarav", profileId: null, coveredByMemberId: "m1" },
    ],
    expenses: [
      {
        id: "e1",
        date: "2026-01-02",
        amount: 300,
        reason: "Lunch",
        paidByMemberId: "m1",
        participantIds: ["m1", "m2"],
        split: "equal",
        shares: {},
        createdByProfileId: "p1",
        createdAt: "2026-01-02T00:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ],
    payments: [
      {
        id: "pay1",
        date: "2026-01-03",
        amount: 50,
        fromMemberId: "m2",
        toMemberId: "m1",
        createdByProfileId: "p1",
        createdAt: "2026-01-03T00:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ],
  }
}


test("JSON round trip preserves splits, covers, voids and ordering", () => {
  const group = sampleGroup()
  group.expenses[0].split = "percent"
  group.expenses[0].shares = { m1: 70, m2: 30 }
  group.payments[0].voidedAt = "2026-01-04T00:00:00.000Z"
  group.ledgerDayOrder = { "2026-01-02": ["e1"] }
  const parsed = parseTripJson(exportTripJson(group))
  assert.deepEqual(parsed.members, group.members)
  assert.deepEqual(parsed.expenses, group.expenses)
  assert.deepEqual(parsed.payments, group.payments)
  assert.deepEqual(parsed.ledgerDayOrder, group.ledgerDayOrder)
  const result = importTripCsv({ profiles: [], groups: [group] }, {
    groupId: group.id, profileId: "p1", csv: exportTripJson(group), format: "json",
  })
  assert.equal(result.group.code, group.code)
  assert.deepEqual(result.group.expenses, group.expenses)
})

test("reject malformed JSON and invalid member references, cycles and shares", () => {
  assert.throws(() => parseTripJson("{"), /Invalid JSON/)
  assert.throws(() => parseTripJson('{"version":9}'), /format or version/)
  for (const alter of [
    (g: Group) => { g.expenses[0].paidByMemberId = "missing" },
    (g: Group) => { g.members[0].coveredByMemberId = "m2" },
    (g: Group) => { g.expenses[0].split = "percent"; g.expenses[0].shares = { m1: 20, m2: 20 } },
  ]) {
    const group = sampleGroup()
    alter(group)
    assert.throws(() => parseTripJson(exportTripJson(group)), /Invalid trip JSON/)
  }
})

test("JSON import requires a trip admin", () => {
  const group = sampleGroup()
  assert.throws(() => importTripCsv({ profiles: [], groups: [group] }, {
    groupId: group.id, profileId: "other", csv: exportTripJson(group), format: "json",
  }), /trip admin/)
})
