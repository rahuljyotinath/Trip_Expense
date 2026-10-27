import assert from "node:assert/strict"
import test from "node:test"
import { ledgerDayItems, ledgerDaysForViewer } from "./ledger-display"
import { addExpense, addPayment, createGroup, createProfile, reorderLedgerDay } from "./operations"
import { emptyStore } from "./types"

test("reorderLedgerDay persists custom order", () => {
  const { store, profile } = createProfile(emptyStore(), "Opener")
  const { store: s1, group } = createGroup(store, {
    name: "Trip",
    memberNames: ["Opener", "Friend"],
    createdByProfileId: profile.id,
  })
  const m1 = group.members[0]!.id
  const m2 = group.members[1]!.id
  const { store: s2, group: g2 } = addExpense(s1, {
    groupId: group.id,
    date: "2026-03-01",
    amount: 100,
    reason: "Lunch",
    paidByMemberId: m1,
    participantIds: [m1, m2],
    createdByProfileId: profile.id,
  })
  const { store: s3, group: g3 } = addPayment(s2, {
    groupId: group.id,
    date: "2026-03-01",
    amount: 50,
    fromMemberId: m1,
    toMemberId: m2,
    createdByProfileId: profile.id,
  })
  const expenseId = g3.expenses.find((e) => !e.voidedAt)!.id
  const paymentId = g3.payments!.find((p) => !p.voidedAt)!.id
  const { group: reordered } = reorderLedgerDay(s3, {
    groupId: group.id,
    profileId: profile.id,
    date: "2026-03-01",
    orderedIds: [paymentId, expenseId],
  })
  const day = ledgerDaysForViewer(reordered, m1)[0]!
  const items = ledgerDayItems(day, reordered.ledgerDayOrder)
  assert.equal(items[0]!.kind, "payment")
  assert.equal(items[1]!.kind, "expense")
})
