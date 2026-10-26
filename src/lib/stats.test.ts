import assert from "node:assert/strict"
import test from "node:test"
import { tripStats } from "./stats"
import type { Expense, Group, Payment } from "./types"

function expense(
  partial: Partial<Expense> & Pick<Expense, "id" | "amount" | "paidByMemberId" | "participantIds">
): Expense {
  return {
    date: "2026-01-01",
    reason: "item",
    split: "equal",
    shares: {},
    createdByProfileId: "p1",
    createdAt: "2026-01-01T00:00:00.000Z",
    voidedAt: null,
    voidedByProfileId: null,
    ...partial,
  }
}

function trip(expenses: Expense[], payments: Payment[] = []): Group {
  return {
    id: "g",
    name: "Test",
    code: "AAAAAA",
    currency: "INR",
    startDate: null,
    endDate: null,
    createdByProfileId: "p1",
    createdAt: "2026-01-01T00:00:00.000Z",
    members: [
      { id: "a", name: "A", profileId: "p1" },
      { id: "b", name: "B", profileId: null },
    ],
    expenses,
    payments,
  }
}

test("tripStats totals group spend and equal shares", () => {
  const stats = tripStats(
    trip([
      expense({
        id: "e1",
        amount: 100,
        paidByMemberId: "a",
        participantIds: ["a", "b"],
      }),
    ])
  )
  assert.equal(stats.totalSpend, 100)
  assert.equal(stats.byMember.a?.share, 50)
  assert.equal(stats.byMember.a?.paid, 100)
  assert.equal(stats.byMember.b?.share, 50)
  assert.equal(stats.byMember.b?.paid, 0)
  assert.equal(stats.byMember.b?.net, -50)
})

test("voided expense excluded from tripStats", () => {
  const stats = tripStats(
    trip([
      expense({
        id: "e1",
        amount: 100,
        paidByMemberId: "a",
        participantIds: ["a", "b"],
        voidedAt: "2026-01-02T00:00:00.000Z",
        voidedByProfileId: "p1",
      }),
    ])
  )
  assert.equal(stats.totalSpend, 0)
  assert.equal(stats.byMember.a?.share, 0)
})

test("tripStats percent split share", () => {
  const stats = tripStats(
    trip([
      expense({
        id: "e1",
        amount: 100,
        paidByMemberId: "a",
        participantIds: ["a", "b"],
        split: "percent",
        shares: { a: 70, b: 30 },
      }),
    ])
  )
  assert.equal(stats.byMember.a?.share, 70)
  assert.equal(stats.byMember.b?.share, 30)
})

test("payment changes net not spend or share", () => {
  const stats = tripStats(
    trip(
      [
        expense({
          id: "e1",
          amount: 100,
          paidByMemberId: "a",
          participantIds: ["a", "b"],
        }),
      ],
      [
        {
          id: "pay1",
          date: "2026-01-02",
          amount: 50,
          fromMemberId: "b",
          toMemberId: "a",
          createdByProfileId: "p1",
          createdAt: "2026-01-02T00:00:00.000Z",
          voidedAt: null,
          voidedByProfileId: null,
        },
      ]
    )
  )
  assert.equal(stats.totalSpend, 100)
  assert.equal(stats.byMember.b?.share, 50)
  assert.equal(stats.byMember.b?.net, 0)
})
