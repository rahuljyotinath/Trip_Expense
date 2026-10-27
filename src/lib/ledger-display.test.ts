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
  groupPaidBackSentByMember,
  paidBackReceivedForMember,
  ledgerDaysForViewer,
  expenseRowMeta,
  ledgerDayItems,
  expenseViewerSecondAmount,
  paymentViewerTone,
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
  const m2 = rows.find((r) => r.memberId === "m2")
  assert.equal(m1?.paid, 200)
  assert.equal(m1?.received, 80)
  assert.equal(m2?.paid, 80)
  assert.equal(m2?.received, 0)
})

test("groupMemberPaidAndReceived includes cash sent in paid", () => {
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
        amount: 40,
        fromMemberId: "m1",
        toMemberId: "m2",
        createdByProfileId: "p1",
        createdAt: "2026-01-02T12:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ],
  })
  const rows = groupMemberPaidAndReceived(g)
  assert.equal(rows.find((r) => r.memberId === "m1")?.paid, 40)
  assert.equal(rows.find((r) => r.memberId === "m1")?.received, 0)
  assert.equal(rows.find((r) => r.memberId === "m2")?.received, 40)
  assert.equal(rows.find((r) => r.memberId === "m2")?.paid, 0)
})

test("groupPaidBackSentByMember and paidBackReceivedForMember", () => {
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
        amount: 25,
        fromMemberId: "m1",
        toMemberId: "m2",
        createdByProfileId: "p1",
        createdAt: "2026-01-02T12:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ],
  })
  assert.equal(groupPaidBackSentByMember(g).find((r) => r.memberId === "m1")?.amount, 25)
  assert.equal(paidBackReceivedForMember(g, "m2"), 25)
  assert.equal(paidBackReceivedForMember(g, "m1"), 0)
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

test("ledgerDaysForViewer shows all paid-back to every member", () => {
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
  assert.equal(ledgerDaysForViewer(g, "m3")[0]!.payments.length, 1)
  assert.equal(ledgerDaysForViewer(g, "m1")[0]!.payments.length, 1)
})

test("expenseViewerSecondAmount You lent is bill minus viewer share", () => {
  const e = expense({
    id: "shared",
    participantIds: ["m1", "m2"],
    paidByMemberId: "m1",
    amount: 100,
  })
  const ids = ["m1", "m2"]
  const lent = expenseViewerSecondAmount(e, "m1", ids)
  assert.deepEqual(lent, { kind: "lent", amount: 50 })
  const owe = expenseViewerSecondAmount(e, "m2", ids)
  assert.deepEqual(owe, { kind: "owe", amount: 50 })
})

test("expenseViewerSecondAmount percent split uses share cuts", () => {
  const e = expense({
    id: "pct",
    participantIds: ["m1", "m2"],
    paidByMemberId: "m1",
    amount: 100,
    split: "percent",
    shares: { m1: 70, m2: 30 },
  })
  const ids = ["m1", "m2"]
  assert.deepEqual(expenseViewerSecondAmount(e, "m1", ids), { kind: "lent", amount: 30 })
  assert.deepEqual(expenseViewerSecondAmount(e, "m2", ids), { kind: "owe", amount: 30 })
})

test("expenseViewerSecondAmount skips zero lent and unseated or off-bill", () => {
  const solo = expense({
    id: "solo",
    participantIds: ["m1"],
    paidByMemberId: "m1",
    amount: 40,
  })
  assert.deepEqual(expenseViewerSecondAmount(solo, "m1", ["m1", "m2"]), { kind: "none" })
  const shared = expense({
    id: "shared",
    participantIds: ["m1", "m2"],
    paidByMemberId: "m1",
    amount: 80,
  })
  assert.deepEqual(expenseViewerSecondAmount(shared, null, ["m1", "m2"]), { kind: "none" })
  assert.deepEqual(expenseViewerSecondAmount(shared, "m3", ["m1", "m2", "m3"]), {
    kind: "none",
  })
  const treated = expense({
    id: "treat",
    participantIds: ["m2"],
    paidByMemberId: "m1",
    amount: 60,
  })
  assert.deepEqual(expenseViewerSecondAmount(treated, "m1", ["m1", "m2"]), {
    kind: "lent",
    amount: 60,
  })
})

test("paymentViewerTone is received / paid-back / none", () => {
  const payment = {
    id: "pay1",
    date: "2026-01-02",
    amount: 20,
    fromMemberId: "m1",
    toMemberId: "m2",
    createdByProfileId: "p1",
    createdAt: "2026-01-02T12:00:00.000Z",
    voidedAt: null,
    voidedByProfileId: null,
  }
  assert.equal(paymentViewerTone(payment, "m2"), "received")
  assert.equal(paymentViewerTone(payment, "m1"), "paid-back")
  assert.equal(paymentViewerTone(payment, "m3"), "none")
  assert.equal(paymentViewerTone(payment, null), "none")
})

test("ledgerDayItems interleaves expenses and payments oldest first", () => {
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
        createdAt: "2026-01-02T15:00:00.000Z",
      }),
    ],
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
  const items = ledgerDayItems(ledgerDaysForViewer(g, "m1")[0]!)
  assert.equal(items[0]!.kind, "payment")
  assert.equal(items[1]!.kind, "expense")
})

test("expenseRowMeta lists payer and participants", () => {
  const g = group({
    members: [
      { id: "m1", name: "Rahul", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "Seemon", profileId: null, coveredByMemberId: null },
      { id: "m3", name: "Priya", profileId: null, coveredByMemberId: null },
    ],
    expenses: [
      expense({
        id: "e1",
        paidByMemberId: "m2",
        participantIds: ["m1", "m2", "m3"],
      }),
    ],
  })
  assert.match(expenseRowMeta(g, g.expenses[0]!, "m1"), /Paid by Seemon/)
  assert.match(expenseRowMeta(g, g.expenses[0]!, "m1"), /With: you, Seemon, Priya/)
})

test("ledgerDayItems respects ledgerDayOrder", () => {
  const g = group({
    members: [
      { id: "m1", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "B", profileId: "p2", coveredByMemberId: null },
    ],
    expenses: [
      expense({
        id: "e1",
        participantIds: ["m1", "m2"],
        paidByMemberId: "m1",
        date: "2026-01-02",
        createdAt: "2026-01-02T12:00:00.000Z",
      }),
    ],
    payments: [
      {
        id: "pay1",
        date: "2026-01-02",
        amount: 20,
        fromMemberId: "m1",
        toMemberId: "m2",
        createdByProfileId: "p1",
        createdAt: "2026-01-02T15:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ],
    ledgerDayOrder: { "2026-01-02": ["pay1", "e1"] },
  })
  const day = ledgerDaysForViewer(g, "m1")[0]!
  const items = ledgerDayItems(day, g.ledgerDayOrder)
  assert.equal(items[0]!.kind, "payment")
  assert.equal(items[1]!.kind, "expense")
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
