import assert from "node:assert/strict"
import test from "node:test"
import { previewGroupPatch } from "./client-api"
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
    expenses: [
      {
        id: "e1",
        date: "2026-03-01",
        amount: 100,
        reason: "Tea",
        paidByMemberId: "m1",
        participantIds: ["m1", "m2"],
        split: "equal",
        shares: {},
        createdByProfileId: "p1",
        createdAt: "2026-01-01T00:00:00.000Z",
        voidedAt: null,
        voidedByProfileId: null,
      },
    ],
    payments: [],
  }
}

test("previewGroupPatch add-expense uses actor when profileId is blank", () => {
  const group = seatedGroup()
  const next = previewGroupPatch(
    group,
    {
      action: "add-expense",
      date: "2026-03-02",
      amount: 50,
      reason: "Snack",
      paidByMemberId: "m1",
      participantIds: ["m1", "m2"],
      split: "equal",
      shares: {},
      profileId: "",
    },
    pub
  )
  assert.equal(next.expenses.length, 2)
})

test("previewGroupPatch update-expense uses actor when profileId is blank", () => {
  const group = seatedGroup()
  const next = previewGroupPatch(
    group,
    {
      action: "update-expense",
      expenseId: "e1",
      date: "2026-03-01",
      amount: 120,
      reason: "Tea (updated)",
      paidByMemberId: "m1",
      participantIds: ["m1", "m2"],
      split: "equal",
      shares: {},
      profileId: "",
    },
    pub
  )
  assert.equal(next.expenses[0]?.amount, 120)
  assert.equal(next.expenses[0]?.reason, "Tea (updated)")
})
