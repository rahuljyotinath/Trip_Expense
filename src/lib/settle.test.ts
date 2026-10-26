import assert from "node:assert/strict"
import test from "node:test"
import {
  coverRoot,
  expenseShareCutsPaise,
  netBalances,
  settlementBalances,
  simplifyDebts,
} from "./settle"
import { fromPaise } from "./money"
import type { Expense, Group, Payment } from "./types"

function expense(partial: Partial<Expense> & Pick<Expense, "id" | "amount" | "paidByMemberId" | "participantIds">): Expense {
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
      { id: "a", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "b", name: "B", profileId: null, coveredByMemberId: null },
      { id: "c", name: "C", profileId: null, coveredByMemberId: null },
    ],
    expenses,
    payments,
  }
}

test("expenseShareCutsPaise skips voided", () => {
  const cuts = expenseShareCutsPaise(
    expense({
      id: "e1",
      amount: 100,
      paidByMemberId: "a",
      participantIds: ["a", "b"],
      voidedAt: "2026-01-02T00:00:00.000Z",
      voidedByProfileId: "p1",
    }),
    ["a", "b"]
  )
  assert.equal(cuts, null)
})

test("expenseShareCutsPaise equal split", () => {
  const cuts = expenseShareCutsPaise(
    expense({
      id: "e1",
      amount: 100,
      paidByMemberId: "a",
      participantIds: ["a", "b"],
    }),
    ["a", "b"]
  )
  assert.ok(cuts)
  assert.equal(fromPaise(cuts.get("a") ?? 0), 50)
  assert.equal(fromPaise(cuts.get("b") ?? 0), 50)
})

test("equal split of one bill", () => {
  const group = trip([
    expense({
      id: "e1",
      amount: 100,
      reason: "taxi",
      paidByMemberId: "a",
      participantIds: ["a", "b"],
    }),
  ])
  const balances = netBalances(group)
  assert.equal(balances.a, 50)
  assert.equal(balances.b, -50)
  assert.deepEqual(simplifyDebts(group), [
    { fromMemberId: "b", toMemberId: "a", amount: 50 },
  ])
})

test("percent split 70 / 30", () => {
  const group = trip([
    expense({
      id: "e1",
      amount: 100,
      paidByMemberId: "a",
      participantIds: ["a", "b"],
      split: "percent",
      shares: { a: 70, b: 30 },
    }),
  ])
  const balances = netBalances(group)
  assert.equal(balances.a, 30)
  assert.equal(balances.b, -30)
})

test("voided expense does not count", () => {
  const group = trip([
    expense({
      id: "e1",
      amount: 100,
      paidByMemberId: "a",
      participantIds: ["a", "b"],
      voidedAt: "2026-01-02T00:00:00.000Z",
      voidedByProfileId: "p1",
    }),
  ])
  const balances = netBalances(group)
  assert.equal(balances.a, 0)
  assert.equal(balances.b, 0)
  assert.deepEqual(simplifyDebts(group), [])
})

test("paid-back payment clears the debt", () => {
  const group = trip(
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
        date: "2026-01-03",
        amount: 50,
        fromMemberId: "b",
        toMemberId: "a",
        createdByProfileId: "p1",
        createdAt: "2026-01-03T00:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ]
  )
  assert.deepEqual(simplifyDebts(group), [])
})

test("voided payment is ignored", () => {
  const group = trip(
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
        date: "2026-01-03",
        amount: 50,
        fromMemberId: "b",
        toMemberId: "a",
        createdByProfileId: "p1",
        createdAt: "2026-01-03T00:00:00.000Z",
        voidedAt: "2026-01-04T00:00:00.000Z",
        voidedByProfileId: "p1",
      },
    ]
  )
  assert.deepEqual(simplifyDebts(group), [
    { fromMemberId: "b", toMemberId: "a", amount: 50 },
  ])
})

test("remainder paise goes to first participants", () => {
  const group = trip([
    expense({
      id: "e1",
      amount: 100,
      reason: "tea",
      paidByMemberId: "a",
      participantIds: ["a", "b", "c"],
    }),
  ])
  const balances = netBalances(group)
  assert.equal(Number((balances.a + balances.b + balances.c).toFixed(2)), 0)
})

test("two bills collapse to fewer transfers", () => {
  const group = trip([
    expense({
      id: "e1",
      amount: 300,
      reason: "stay",
      paidByMemberId: "a",
      participantIds: ["a", "b", "c"],
    }),
    expense({
      id: "e2",
      date: "2026-01-02",
      amount: 90,
      reason: "food",
      paidByMemberId: "b",
      participantIds: ["b", "c"],
    }),
  ])
  const transfers = simplifyDebts(group)
  const paid = transfers.reduce((sum, item) => sum + item.amount, 0)
  assert.equal(paid, 200)
  assert.ok(transfers.every((item) => item.toMemberId === "a"))
})

function tripWithMembers(
  members: Group["members"],
  expenses: Expense[],
  payments: Payment[] = []
): Group {
  return { ...trip(expenses, payments), members }
}

test("cover absorbs dependent net in settlement", () => {
  const group = tripWithMembers(
    [
      { id: "priya", name: "Priya", profileId: "p1", coveredByMemberId: null },
      { id: "aarav", name: "Aarav", profileId: null, coveredByMemberId: "priya" },
      { id: "rahul", name: "Rahul", profileId: null, coveredByMemberId: null },
    ],
    [
      expense({
        id: "e1",
        amount: 300,
        paidByMemberId: "priya",
        participantIds: ["priya", "aarav", "rahul"],
      }),
    ]
  )
  const folded = settlementBalances(group)
  assert.equal(folded.priya, 100)
  assert.equal(folded.aarav, 0)
  assert.equal(folded.rahul, -100)
  assert.deepEqual(simplifyDebts(group), [
    { fromMemberId: "rahul", toMemberId: "priya", amount: 100 },
  ])
})

test("cover settles even when not on the bill", () => {
  const group = tripWithMembers(
    [
      { id: "a", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "b", name: "B", profileId: null, coveredByMemberId: "c" },
      { id: "c", name: "C", profileId: null, coveredByMemberId: null },
    ],
    [
      expense({
        id: "e1",
        amount: 200,
        paidByMemberId: "a",
        participantIds: ["a", "b"],
      }),
    ]
  )
  assert.deepEqual(simplifyDebts(group), [
    { fromMemberId: "c", toMemberId: "a", amount: 100 },
  ])
})

test("cover chain resolves to root for settlement", () => {
  const group = tripWithMembers(
    [
      { id: "a", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "b", name: "B", profileId: null, coveredByMemberId: "a" },
      { id: "c", name: "C", profileId: null, coveredByMemberId: "b" },
    ],
    [
      expense({
        id: "e1",
        amount: 100,
        paidByMemberId: "b",
        participantIds: ["c"],
      }),
    ]
  )
  assert.equal(coverRoot(group, "c"), "a")
  assert.equal(coverRoot(group, "b"), "a")
  const folded = settlementBalances(group)
  assert.equal(folded.c, 0)
  assert.equal(folded.b, 0)
  assert.equal(folded.a, 0)
})

test("covered seats are not transfer endpoints", () => {
  const group = tripWithMembers(
    [
      { id: "a", name: "A", profileId: "p1", coveredByMemberId: null },
      { id: "b", name: "B", profileId: null, coveredByMemberId: "a" },
    ],
    [
      expense({
        id: "e1",
        amount: 100,
        paidByMemberId: "a",
        participantIds: ["a", "b"],
      }),
    ]
  )
  const transfers = simplifyDebts(group)
  assert.equal(transfers.length, 0)
  for (const transfer of transfers) {
    assert.notEqual(transfer.fromMemberId, "b")
    assert.notEqual(transfer.toMemberId, "b")
  }
})
