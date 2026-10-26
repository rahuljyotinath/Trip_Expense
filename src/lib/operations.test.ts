import assert from "node:assert/strict"
import test from "node:test"
import {
  addExpense,
  addPayment,
  createGroup,
  createProfile,
  deleteExpense,
  importTripCsv,
  setMemberCover,
  updateExpense,
  updateGroup,
} from "./operations"
import { exportTripCsv } from "./trip-csv"
import { emptyStore, type Group } from "./types"

function baseStore() {
  const { store, profile } = createProfile(emptyStore(), "Opener")
  return { store, profile }
}

function seatedTrip(store: ReturnType<typeof baseStore>["store"], profileId: string) {
  const { store: withTrip, group } = createGroup(store, {
    name: "Weekend",
    memberNames: ["Opener", "Friend"],
    createdByProfileId: profileId,
    startDate: "2026-03-01",
    endDate: "2026-03-07",
  })
  return { store: withTrip, group }
}

test("updateGroup changes name and dates for trip opener", () => {
  const { store, profile } = baseStore()
  const { store: s1, group } = seatedTrip(store, profile.id)
  const { store: s2, group: next } = updateGroup(s1, {
    groupId: group.id,
    profileId: profile.id,
    name: "Renamed",
    startDate: "2026-04-01",
    endDate: null,
  })
  assert.equal(next.name, "Renamed")
  assert.equal(next.startDate, "2026-04-01")
  assert.equal(next.endDate, null)
  assert.equal(s2.groups[0]?.name, "Renamed")
})

test("updateGroup rejects non-opener", () => {
  const { store, profile } = baseStore()
  const { store: s1, group } = seatedTrip(store, profile.id)
  assert.throws(() =>
    updateGroup(s1, {
      groupId: group.id,
      profileId: "other",
      name: "Nope",
    })
  )
})

test("updateExpense edits fields for author", () => {
  const { store, profile } = baseStore()
  let s = store
  let group: Group
  ;({ store: s, group } = seatedTrip(s, profile.id))
  const payer = group.members[0]!
  const friend = group.members[1]!
  ;({ store: s, group } = addExpense(s, {
    groupId: group.id,
    date: "2026-03-02",
    amount: 100,
    reason: "Dinner",
    paidByMemberId: payer.id,
    participantIds: [payer.id, friend.id],
    createdByProfileId: profile.id,
  }))
  const expense = group.expenses[0]!
  const updated = updateExpense(s, {
    groupId: group.id,
    expenseId: expense.id,
    profileId: profile.id,
    date: "2026-03-03",
    amount: 120,
    reason: "Dinner + tip",
    paidByMemberId: payer.id,
    participantIds: [payer.id, friend.id],
    split: "equal",
    shares: {},
  })
  const item = updated.group.expenses[0]!
  assert.equal(item.reason, "Dinner + tip")
  assert.equal(item.amount, 120)
  assert.equal(item.date, "2026-03-03")
})

test("createGroup rejects end before start", () => {
  const { store, profile } = baseStore()
  assert.throws(() =>
    createGroup(store, {
      name: "Bad dates",
      memberNames: ["Opener", "Friend"],
      createdByProfileId: profile.id,
      startDate: "2026-03-10",
      endDate: "2026-03-01",
    })
  )
})

test("createGroup defaults null dates", () => {
  const { store, profile } = baseStore()
  const { group } = createGroup(store, {
    name: "No dates",
    memberNames: ["Opener", "Friend"],
    createdByProfileId: profile.id,
  })
  assert.equal(group.startDate, null)
  assert.equal(group.endDate, null)
})

test("deleteExpense rejects non-author non-opener", () => {
  const { store, profile } = baseStore()
  let s = store
  let group: Group
  ;({ store: s, group } = seatedTrip(s, profile.id))
  const payer = group.members[0]!
  ;({ store: s, group } = addExpense(s, {
    groupId: group.id,
    date: "2026-03-02",
    amount: 50,
    reason: "Snack",
    paidByMemberId: payer.id,
    participantIds: [payer.id],
    createdByProfileId: profile.id,
  }))
  const expense = group.expenses[0]!
  assert.throws(() =>
    deleteExpense(s, {
      groupId: group.id,
      expenseId: expense.id,
      profileId: "stranger",
    })
  )
})

test("deleteExpense removes row", () => {
  const { store, profile } = baseStore()
  let s = store
  let group: Group
  ;({ store: s, group } = seatedTrip(s, profile.id))
  const payer = group.members[0]!
  ;({ store: s, group } = addExpense(s, {
    groupId: group.id,
    date: "2026-03-02",
    amount: 50,
    reason: "Snack",
    paidByMemberId: payer.id,
    participantIds: [payer.id],
    createdByProfileId: profile.id,
  }))
  const expense = group.expenses[0]!
  const { group: after } = deleteExpense(s, {
    groupId: group.id,
    expenseId: expense.id,
    profileId: profile.id,
  })
  assert.equal(after.expenses.length, 0)
})

test("importTripCsv replaces ledger for opener", () => {
  const { store, profile } = baseStore()
  const { store: s1, group } = seatedTrip(store, profile.id)
  const csv = exportTripCsv({
    ...group,
    members: [
      ...group.members,
      { id: "m3", name: "Kid", profileId: null, coveredByMemberId: null },
    ],
    expenses: [],
    payments: [],
  })
  const { group: next } = importTripCsv(s1, {
    groupId: group.id,
    profileId: profile.id,
    csv,
  })
  assert.equal(next.members.length, 3)
  assert.equal(next.members.some((item) => item.name === "Kid"), true)
})

test("importTripCsv rejects non-opener", () => {
  const { store, profile } = baseStore()
  const { store: s1, group } = seatedTrip(store, profile.id)
  const csv = exportTripCsv(group)
  assert.throws(() =>
    importTripCsv(s1, {
      groupId: group.id,
      profileId: "other",
      csv,
    })
  )
})

test("setMemberCover requires claimed seat", () => {
  const { store, profile } = baseStore()
  const { store: s1, group } = seatedTrip(store, profile.id)
  const friend = group.members[1]!
  const { store: s2 } = createProfile(s1, "Stranger")
  const stranger = s2.profiles.find((item) => item.name === "Stranger")!
  assert.throws(() =>
    setMemberCover(s2, {
      groupId: group.id,
      memberId: friend.id,
      coveredByMemberId: group.members[0]!.id,
      profileId: stranger.id,
    })
  )
})

test("setMemberCover rejects self and cycles", () => {
  const { store, profile } = baseStore()
  const { store: s1, group } = seatedTrip(store, profile.id)
  const opener = group.members[0]!
  const friend = group.members[1]!
  assert.throws(() =>
    setMemberCover(s1, {
      groupId: group.id,
      memberId: friend.id,
      coveredByMemberId: friend.id,
      profileId: profile.id,
    })
  )
  const { store: s2, group: g2 } = setMemberCover(s1, {
    groupId: group.id,
    memberId: friend.id,
    coveredByMemberId: opener.id,
    profileId: profile.id,
  })
  assert.equal(
    g2.members.find((item) => item.id === friend.id)?.coveredByMemberId,
    opener.id
  )
  assert.throws(() =>
    setMemberCover(s2, {
      groupId: g2.id,
      memberId: opener.id,
      coveredByMemberId: friend.id,
      profileId: profile.id,
    })
  )
})

test("setMemberCover clears cover", () => {
  const { store, profile } = baseStore()
  const { store: s1, group } = seatedTrip(store, profile.id)
  const opener = group.members[0]!
  const friend = group.members[1]!
  const { store: s2 } = setMemberCover(s1, {
    groupId: group.id,
    memberId: friend.id,
    coveredByMemberId: opener.id,
    profileId: profile.id,
  })
  const { group: cleared } = setMemberCover(s2, {
    groupId: group.id,
    memberId: friend.id,
    coveredByMemberId: null,
    profileId: profile.id,
  })
  assert.equal(
    cleared.members.find((item) => item.id === friend.id)?.coveredByMemberId,
    null
  )
})

test("addPayment rejects covered from or to seat", () => {
  const { store, profile } = baseStore()
  let s = store
  let group: Group
  ;({ store: s, group } = seatedTrip(s, profile.id))
  const opener = group.members[0]!
  const friend = group.members[1]!
  ;({ store: s, group } = setMemberCover(s, {
    groupId: group.id,
    memberId: friend.id,
    coveredByMemberId: opener.id,
    profileId: profile.id,
  }))
  assert.throws(() =>
    addPayment(s, {
      groupId: group.id,
      date: "2026-03-02",
      amount: 10,
      fromMemberId: friend.id,
      toMemberId: opener.id,
      createdByProfileId: profile.id,
    })
  )
  assert.throws(() =>
    addPayment(s, {
      groupId: group.id,
      date: "2026-03-02",
      amount: 10,
      fromMemberId: opener.id,
      toMemberId: friend.id,
      createdByProfileId: profile.id,
    })
  )
})
