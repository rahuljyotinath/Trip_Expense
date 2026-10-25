import assert from "node:assert/strict"
import test from "node:test"
import { netBalances, simplifyDebts } from "./settle"
import type { Group } from "./types"

function trip(expenses: Group["expenses"]): Group {
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
  }
}

test("equal split of one bill", () => {
  const group = trip([
    {
      id: "e1",
      date: "2026-01-01",
      amount: 100,
      reason: "taxi",
      paidByMemberId: "a",
      participantIds: ["a", "b"],
      createdByProfileId: "p1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ])
  const balances = netBalances(group)
  assert.equal(balances.a, 50)
  assert.equal(balances.b, -50)
  assert.deepEqual(simplifyDebts(group), [
    { fromMemberId: "b", toMemberId: "a", amount: 50 },
  ])
})

test("remainder paise goes to first participants", () => {
  const group = trip([
    {
      id: "e1",
      date: "2026-01-01",
      amount: 100,
      reason: "tea",
      paidByMemberId: "a",
      participantIds: ["a", "b", "c"],
      createdByProfileId: "p1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ])
  const balances = netBalances(group)
  assert.equal(Number((balances.a + balances.b + balances.c).toFixed(2)), 0)
})

test("two bills collapse to fewer transfers", () => {
  const group = trip([
    {
      id: "e1",
      date: "2026-01-01",
      amount: 300,
      reason: "stay",
      paidByMemberId: "a",
      participantIds: ["a", "b", "c"],
      createdByProfileId: "p1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "e2",
      date: "2026-01-02",
      amount: 90,
      reason: "food",
      paidByMemberId: "b",
      participantIds: ["b", "c"],
      createdByProfileId: "p1",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ])
  const transfers = simplifyDebts(group)
  const paid = transfers.reduce((sum, item) => sum + item.amount, 0)
  assert.equal(paid, 200)
  assert.ok(transfers.every((item) => item.toMemberId === "a"))
})
