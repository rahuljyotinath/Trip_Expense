import assert from "node:assert/strict"
import test from "node:test"
import { netBalances, simplifyDebts } from "./settle"
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
    createdByProfileId: "p1",
    createdAt: "2026-01-01T00:00:00.000Z",
    members: [
      { id: "a", name: "A", profileId: "p1" },
      { id: "b", name: "B", profileId: null },
      { id: "c", name: "C", profileId: null },
    ],
    expenses,
    payments,
  }
}

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
