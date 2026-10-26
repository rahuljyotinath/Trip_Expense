import assert from "node:assert/strict"
import test from "node:test"
import { addExpense } from "./operations"
import { preparePatchStore, upsertProfileInStore } from "./store-session"
import { emptyStore, type Group, type PublicProfile } from "./types"

const pub: PublicProfile = {
  id: "p1",
  username: "rahul",
  name: "Rahul",
  email: null,
  phone: null,
  createdAt: "2026-01-01T00:00:00.000Z",
}

function seatedGroup(): Group {
  return {
    id: "g1",
    name: "Trip",
    code: "ABCDEF",
    currency: "INR",
    startDate: null,
    endDate: null,
    createdByProfileId: "p1",
    createdAt: "2026-01-01T00:00:00.000Z",
    members: [
      { id: "m1", name: "Rahul", profileId: "p1", coveredByMemberId: null },
      { id: "m2", name: "Friend", profileId: null, coveredByMemberId: null },
    ],
    expenses: [],
    payments: [],
  }
}

test("upsertProfileInStore adds profile to empty store", () => {
  const store = upsertProfileInStore(emptyStore(), pub)
  assert.equal(store.profiles.length, 1)
  assert.equal(store.profiles[0]?.id, "p1")
})

test("preparePatchStore allows addExpense without server profiles", () => {
  const group = seatedGroup()
  const store = preparePatchStore(emptyStore(), group, pub)
  const { group: next } = addExpense(store, {
    groupId: group.id,
    date: "2026-03-01",
    amount: 100,
    reason: "Tea",
    paidByMemberId: "m1",
    participantIds: ["m1", "m2"],
    createdByProfileId: "p1",
  })
  assert.equal(next.expenses.length, 1)
})

test("preparePatchStore without session still fails addExpense", () => {
  const group = seatedGroup()
  const store = preparePatchStore(emptyStore(), group, null)
  assert.throws(() =>
    addExpense(store, {
      groupId: group.id,
      date: "2026-03-01",
      amount: 100,
      reason: "Tea",
      paidByMemberId: "m1",
      participantIds: ["m1", "m2"],
      createdByProfileId: "p1",
    })
  )
})
