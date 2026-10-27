import assert from "node:assert/strict"
import test from "node:test"
import {
  compareLedgerExpenses,
  isSoloSelfExpense,
  ledgerExpensesForDisplay,
} from "./ledger-display"
import type { Expense, Group } from "./types"

function expense(
  partial: Partial<Expense> & Pick<Expense, "id" | "participantIds" | "paidByMemberId">
): Expense {
  return {
    date: "2026-01-02",
    amount: 100,
    reason: "test",
    split: "equal",
    shares: {},
    createdByProfileId: "p1",
    createdAt: "2026-01-02T12:00:00.000Z",
    voidedAt: null,
    voidedByProfileId: null,
    ...partial,
  }
}

function group(partial: Partial<Group> & Pick<Group, "members" | "expenses">): Group {
  return {
    id: "g1",
    name: "Trip",
    code: "ABCD",
    currency: "INR",
    startDate: null,
    endDate: null,
    createdByProfileId: "p1",
    createdAt: "2026-01-01T00:00:00.000Z",
    payments: [],
    ...partial,
  }
}

test("compareLedgerExpenses sorts oldest first", () => {
  const a = expense({ id: "e1", participantIds: ["m1"], paidByMemberId: "m2", date: "2026-01-01" })
  const b = expense({ id: "e2", participantIds: ["m1"], paidByMemberId: "m2", date: "2026-01-03" })
  assert.equal(compareLedgerExpenses(a, b) < 0, true)
})

test("ledger hides solo self-pay", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
    ],
    expenses: [
      expense({ id: "solo", participantIds: ["m1"], paidByMemberId: "m1" }),
      expense({ id: "shared", participantIds: ["m1", "m2"], paidByMemberId: "m1" }),
    ],
  })
  const visible = ledgerExpensesForDisplay(g, "m1")
  assert.equal(visible.length, 1)
  assert.equal(visible[0]!.id, "shared")
})

test("ledger hides expenses with unclaimed members", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: null, coveredByMemberId: null },
    ],
    expenses: [
      expense({ id: "open", participantIds: ["m1", "m2"], paidByMemberId: "m1" }),
      expense({ id: "closed", participantIds: ["m1"], paidByMemberId: "m1", amount: 50 }),
    ],
  })
  const visible = ledgerExpensesForDisplay(g, "m1")
  assert.equal(visible.length, 0)
})

test("ledger hides other people's bills when viewer has a seat", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
      { id: "m3", name: "C", profileId: "p3", coveredByMemberId: null },
    ],
    expenses: [
      expense({ id: "mine", participantIds: ["m1", "m2"], paidByMemberId: "m2" }),
      expense({
        id: "theirs",
        participantIds: ["m2", "m3"],
        paidByMemberId: "m2",
        amount: 40,
      }),
    ],
  })
  const visible = ledgerExpensesForDisplay(g, "m1")
  assert.equal(visible.length, 1)
  assert.equal(visible[0]!.id, "mine")
})
