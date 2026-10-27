import assert from "node:assert/strict"
import test from "node:test"
import {
  compareLedgerExpenses,
  ledgerGroupExpenses,
  ledgerPersonalExpenses,
  ledgerPersonalExpensesForViewer,
  ledgerPersonalPayments,
  ledgerPersonalPaymentsForViewer,
  groupPaidByMember,
  groupMemberPaidAndReceived,
  groupPaidBackReceivedByMember,
  ledgerDaysForViewer,
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

test("groupPaidByMember sums group spends by payer", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
    ],
    expenses: [
      expense({ id: "e1", participantIds: ["m1", "m2"], paidByMemberId: "m1", amount: 100 }),
      expense({ id: "e2", participantIds: ["m1", "m2"], paidByMemberId: "m2", amount: 40 }),
      expense({ id: "solo", participantIds: ["m1"], paidByMemberId: "m1", amount: 999 }),
    ],
  })
  const rows = groupPaidByMember(g)
  assert.equal(rows.length, 2)
  assert.equal(rows[0]!.memberId, "m1")
  assert.equal(rows[0]!.amount, 100)
  assert.equal(rows[1]!.amount, 40)
})

test("personal ledger for viewer hides others solo spends", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
    ],
    expenses: [
      expense({ id: "solo1", participantIds: ["m1"], paidByMemberId: "m1", amount: 50 }),
      expense({ id: "solo2", participantIds: ["m2"], paidByMemberId: "m2", amount: 80 }),
    ],
  })
  assert.equal(
    ledgerPersonalExpensesForViewer(g, "m1").map((e) => e.id).join(","),
    "solo1"
  )
  assert.equal(ledgerPersonalExpensesForViewer(g, null).length, 0)
})

test("personal payments for viewer only when involved", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
      { id: "m3", name: "C", profileId: "p3", coveredByMemberId: null },
    ],
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
  assert.equal(ledgerPersonalPaymentsForViewer(g, "m1").length, 1)
  assert.equal(ledgerPersonalPaymentsForViewer(g, "m2").length, 1)
  assert.equal(ledgerPersonalPaymentsForViewer(g, "m3").length, 0)
})

test("groupPaidBackReceivedByMember sums payments to recipient", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
    ],
    expenses: [],
    payments: [
      {
        id: "pay1",
        date: "2026-01-02",
        amount: 100,
        fromMemberId: "m1",
        toMemberId: "m2",
        createdByProfileId: "p1",
        createdAt: "2026-01-02T12:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
      {
        id: "pay2",
        date: "2026-01-03",
        amount: 50,
        fromMemberId: "m2",
        toMemberId: "m1",
        createdByProfileId: "p2",
        createdAt: "2026-01-03T12:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ],
  })
  const received = groupPaidBackReceivedByMember(g)
  assert.equal(received.find((r) => r.memberId === "m1")?.amount, 50)
  assert.equal(received.find((r) => r.memberId === "m2")?.amount, 100)
})

test("groupMemberPaidAndReceived merges paid and received", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
    ],
    expenses: [
      expense({
        id: "shared",
        participantIds: ["m1", "m2"],
        paidByMemberId: "m1",
        amount: 200,
      }),
    ],
    payments: [
      {
        id: "pay1",
        date: "2026-01-02",
        amount: 80,
        fromMemberId: "m2",
        toMemberId: "m1",
        createdByProfileId: "p2",
        createdAt: "2026-01-02T12:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ],
  })
  const rows = groupMemberPaidAndReceived(g)
  const m1 = rows.find((r) => r.memberId === "m1")
  assert.equal(m1?.paid, 200)
  assert.equal(m1?.received, 80)
  assert.equal(rows.some((r) => r.memberId === "m2"), false)
})

test("ledgerDaysForViewer merges expenses and payments by date", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
    ],
    expenses: [
      expense({
        id: "shared",
        participantIds: ["m1", "m2"],
        paidByMemberId: "m1",
        date: "2026-01-02",
        amount: 100,
      }),
    ],
    payments: [
      {
        id: "pay1",
        date: "2026-01-02",
        amount: 30,
        fromMemberId: "m1",
        toMemberId: "m2",
        createdByProfileId: "p1",
        createdAt: "2026-01-02T14:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
      {
        id: "pay2",
        date: "2026-01-05",
        amount: 10,
        fromMemberId: "m2",
        toMemberId: "m1",
        createdByProfileId: "p2",
        createdAt: "2026-01-05T10:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ],
  })
  const days = ledgerDaysForViewer(g, "m1")
  assert.equal(days.length, 2)
  assert.equal(days[0]!.date, "2026-01-02")
  assert.equal(days[0]!.payments.length, 1)
  assert.equal(days[0]!.expenses.length, 1)
  assert.equal(days[0]!.groupSpendTotal, 100)
  assert.equal(days[1]!.date, "2026-01-05")
  assert.equal(days[1]!.expenses.length, 0)
  assert.equal(days[1]!.groupSpendTotal, 0)
})

test("ledgerDaysForViewer hides payments viewer is not part of", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
      { id: "m3", name: "C", profileId: "p3", coveredByMemberId: null },
    ],
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
  assert.equal(ledgerDaysForViewer(g, "m3").length, 0)
  assert.equal(ledgerDaysForViewer(g, "m1")[0]!.payments.length, 1)
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
