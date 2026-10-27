import assert from "node:assert/strict"
import test from "node:test"
import {
  compareLedgerExpenses,
  isSoloSelfExpense,
  ledgerGroupExpenses,
  ledgerPersonalExpenses,
  ledgerPersonalPayments,
  personalExpenditureForMember,
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

test("ledger group vs personal split", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: null, coveredByMemberId: null },
    ],
    expenses: [
      expense({ id: "solo", participantIds: ["m1"], paidByMemberId: "m1", amount: 50 }),
      expense({ id: "shared", participantIds: ["m1", "m2"], paidByMemberId: "m1" }),
    ],
  })
  assert.equal(ledgerGroupExpenses(g).map((e) => e.id).join(","), "shared")
  assert.equal(ledgerPersonalExpenses(g).map((e) => e.id).join(","), "solo")
  assert.equal(personalExpenditureForMember(g, "m1"), 50)
})

test("ledger shows expenses with unclaimed members in group table", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: null, coveredByMemberId: null },
    ],
    expenses: [expense({ id: "open", participantIds: ["m1", "m2"], paidByMemberId: "m1" })],
  })
  assert.equal(ledgerGroupExpenses(g).length, 1)
})

test("ledgerPersonalPayments skips voided", () => {
  const g = group({
    members: [{ id: "m1", name: "A", profileId: "p1", coveredByMemberId: null }],
    expenses: [],
    payments: [
      {
        id: "pay1",
        date: "2026-01-02",
        amount: 20,
        fromMemberId: "m1",
        toMemberId: "m2",
        createdByProfileId: "p1",
        createdAt: "2026-01-02T12:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ],
  })
  assert.equal(ledgerPersonalPayments(g).length, 1)
})
