import assert from "node:assert/strict"
import test from "node:test"
import { exportTripCsv, parseTripCsv } from "./trip-csv"
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

test("export and parse round-trip trip csv", () => {
  const group = sampleGroup()
  const csv = exportTripCsv(group)
  const parsed = parseTripCsv(csv)
  assert.equal(parsed.trip.name, "Goa")
  assert.equal(parsed.members.length, 2)
  const priya = parsed.members.find((m) => m.name === "Priya")
  const aarav = parsed.members.find((m) => m.name === "Aarav")
  assert.equal(aarav?.coveredByMemberId, priya?.id)
  assert.equal(parsed.expenses.length, 1)
  assert.equal(parsed.payments.length, 1)
  assert.equal(parsed.expenses[0]?.reason, "Lunch")
})

test("parse rejects bad member reference", () => {
  const csv = exportTripCsv(sampleGroup()).replace("Priya; Aarav", "Priya; Ghost")
  assert.throws(() => parseTripCsv(csv))
})
