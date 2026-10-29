import { database } from "./test-support/database"
import assert from "node:assert/strict"
import test from "node:test"
import {
  importStoreToRelational,
  loadGroupRelational,
  loadGroupsForProfileRelational,
  loadStoreForMutationRelational,
  persistStoreDiffRelational,
  type Sql,
} from "./ledger-repository"
import { emptyStore, normalizeGroup, type Store } from "./types"

function fixture(expenseCount = 3): Store {
  const store = emptyStore()
  store.profiles = ["p1", "p2", "p3"].map((id) => ({
    id, username: id, passwordHash: "hash", name: id, email: `${id}@example.test`,
    phone: null, upiId: null, createdAt: "2026-01-01",
  }))
  store.groups = ["t1", "t2"].map((id) => normalizeGroup({
    id, name: id, code: id === "t1" ? "ABCDEF" : "UVWXYZ", currency: "INR",
    startDate: null, endDate: null, createdByProfileId: "p1", createdAt: "2026-01-01",
    adminProfileIds: ["p2"],
    members: [
      { id: `${id}-m1`, name: "One", profileId: "p1", coveredByMemberId: null },
      { id: `${id}-m2`, name: "Two", profileId: "p2", coveredByMemberId: `${id}-m1` },
    ],
    expenses: Array.from({ length: expenseCount }, (_, i) => ({
      id: `${id}-e${i}`, date: "2026-01-02", amount: 10, reason: `Spend ${i}`,
      paidByMemberId: `${id}-m1`, participantIds: [`${id}-m1`, `${id}-m2`],
      split: "equal", shares: { [`${id}-m1`]: 5, [`${id}-m2`]: 5 },
      createdByProfileId: "p1", createdAt: "2026-01-02", voidedAt: null, voidedByProfileId: null,
    })),
    payments: [{
      id: `${id}-pay`, date: "2026-01-03", amount: 5, fromMemberId: `${id}-m2`,
      toMemberId: `${id}-m1`, createdByProfileId: "p2", createdAt: "2026-01-03",
      voidedAt: null, voidedByProfileId: null,
    }],
  }))
  store.joinRequests = ["t1", "t2"].map((groupId) => ({
    id: `${groupId}-jr`, groupId, profileId: "p3", status: "pending",
    createdAt: "2026-01-01", decidedAt: null, decidedByProfileId: null,
  }))
  store.tripInvites = ["t1", "t2"].map((groupId) => ({
    id: `${groupId}-inv`, groupId, invitedEmail: "p3@example.test", invitedPhone: null,
    status: "pending", createdByProfileId: "p1", createdAt: "2026-01-01",
    respondedAt: null, respondedByProfileId: null,
  }))
  store.contacts = ["p2", "p3"].map((targetProfileId) => ({
    id: `c-${targetProfileId}`, ownerProfileId: "p1", targetProfileId, source: "trip",
    createdAt: "2026-01-01",
  }))
  return store
}

async function seeded() {
  const harness = await database()
  await importStoreToRelational(harness.sql, fixture())
  harness.statements.length = 0
  return harness
}

async function save(sql: Sql, change: (store: Store) => void, full = false) {
  const state = await loadStoreForMutationRelational(sql, full ? { kind: "full" } : { kind: "trip", tripId: "t1" }, "p1")
  const after = structuredClone(state.store)
  change(after)
  await persistStoreDiffRelational(sql, state.store, after, state)
}

function writes(statements: Statement[]) {
  return statements.filter(({ text }) => /^\s*(INSERT|UPDATE|DELETE)\b/.test(text))
}

test("trip list uses one statement and preserves complete ledgers, order and membership filtering", async () => {
  const { db, sql, statements } = await seeded()
  try {
    const groups = await loadGroupsForProfileRelational(sql, "p1")
    assert.equal(statements.length, 1)
    for (const group of groups) assert.deepEqual(group, await loadGroupRelational(sql, group.id))
    assert.equal(groups.length, 2)
    assert.equal(groups[0].members[1].coveredByMemberId, "t1-m1")
    assert.deepEqual(await loadGroupsForProfileRelational(sql, "p3"), [])
    const extra = fixture().groups[0]
    extra.id = "t3"; extra.code = "NEWTRP"
    extra.members = [{ id: "t3-m1", name: "One", profileId: "p1", coveredByMemberId: null }]
    extra.expenses = []; extra.payments = []
    const state = await loadStoreForMutationRelational(sql, { kind: "full" })
    await persistStoreDiffRelational(sql, state.store, { ...state.store, groups: [...state.store.groups, extra] }, state)
    statements.length = 0
    assert.equal((await loadGroupsForProfileRelational(sql, "p1")).length, 3)
    assert.equal(statements.length, 1)
  } finally { await db.close() }
})

test("single spend edits have constant writes and preserve unrelated trips, roster, payments and metadata", async () => {
  const { db, sql, statements } = await seeded()
  try {
    const other = await loadGroupRelational(sql, "t2")
    const readCounts: number[] = []
    for (const count of [3, 100]) {
      await sql`TRUNCATE profiles CASCADE`
      await importStoreToRelational(sql, fixture(count))
      statements.length = 0
      await save(sql, (store) => { store.groups[0].expenses[0].reason = "Changed" })
      const changed = writes(statements)
      readCounts.push(statements.length)
      assert.equal(readCounts[0], statements.length, "including reads, independent of spend count")
      assert.equal(changed.length, 2, "trip version and one spend only")
      assert.match(changed[1].text, /INSERT INTO expenses/)
      assert.ok(changed.every(({ text }) => !/DELETE FROM/.test(text)))
      const actual = await loadGroupRelational(sql, "t1")
      assert.equal(actual?.expenses[0].reason, "Changed")
      assert.equal(actual?.expenses.length, count)
      assert.deepEqual(actual?.members, fixture().groups[0].members)
      assert.deepEqual(actual?.payments, fixture().groups[0].payments)
    }
    await sql`TRUNCATE profiles CASCADE`
    await importStoreToRelational(sql, fixture())
    await save(sql, (store) => { store.groups[0].expenses.push({ ...store.groups[0].expenses[0], id: "new-spend" }) })
    assert.deepEqual(await loadGroupRelational(sql, "t2"), other)
    statements.length = 0
    await save(sql, (store) => { store.groups[0].expenses = store.groups[0].expenses.filter((row) => row.id !== "new-spend") })
    assert.equal(writes(statements).length, 2)
    assert.deepEqual(await loadGroupRelational(sql, "t1"), fixture().groups[0])
  } finally { await db.close() }
})

test("covers, new members, delegated admins and void/restore persist without rewriting other rows", async () => {
  const { db, sql } = await seeded()
  try {
    await save(sql, (store) => {
      const group = store.groups[0]
      group.members.push({ id: "new-cover", name: "Cover", profileId: "p3", coveredByMemberId: null })
      group.members[1].coveredByMemberId = "new-cover"
      group.adminProfileIds = ["p3"]
      group.expenses[0].voidedAt = "2026-02-01"
      group.expenses[0].voidedByProfileId = "p1"
      group.payments[0].voidedAt = "2026-02-01"
      group.payments[0].voidedByProfileId = "p1"
    })
    let actual = await loadGroupRelational(sql, "t1")
    assert.equal(actual?.members.find((member) => member.id === "t1-m2")?.coveredByMemberId, "new-cover")
    assert.deepEqual(actual?.adminProfileIds, ["p3"])
    assert.equal(actual?.expenses[0].voidedByProfileId, "p1")
    await save(sql, (store) => {
      const group = store.groups[0]
      group.members = group.members.filter((member) => member.id !== "new-cover")
      group.members.find((member) => member.id === "t1-m2")!.coveredByMemberId = null
      group.expenses[0].voidedAt = null; group.expenses[0].voidedByProfileId = null
      group.payments[0].voidedAt = null; group.payments[0].voidedByProfileId = null
    })
    actual = await loadGroupRelational(sql, "t1")
    assert.equal(actual?.members.find((member) => member.id === "t1-m2")?.coveredByMemberId, null)
    assert.equal(actual?.expenses[0].voidedAt, null)
    assert.equal(actual?.payments[0].voidedAt, null)
  } finally { await db.close() }
})

test("metadata diffs affect only changed invites, requests and contacts", async () => {
  const { db, sql, statements } = await seeded()
  try {
    await saveAll(sql, (store) => {
      store.joinRequests![0].status = "approved"
      store.joinRequests![0].decidedByProfileId = "p1"
      store.tripInvites![0].status = "revoked"
      store.contacts![0].source = "search"
    })
    const changed = writes(statements)
    assert.equal(changed.length, 4)
    assert.ok(changed.every(({ text }) => !/DELETE FROM/.test(text)))
    const state = await loadStoreForMutationRelational(sql, { kind: "full" })
    assert.equal(state.store.joinRequests![0].status, "approved")
    assert.equal(state.store.joinRequests![1].status, "pending")
    assert.equal(state.store.tripInvites![1].status, "pending")
    assert.equal(state.store.contacts![1].source, "trip")
    await saveAll(sql, (store) => { store.contacts = store.contacts!.filter((row) => row.id !== "c-p2") })
    assert.deepEqual((await db.query<{ id: string }>("SELECT id FROM contacts")).rows, [{ id: "c-p3" }])
    await saveAll(sql, (store) => {
      const oldRequest = store.joinRequests!.find((row) => row.groupId === "t1")!
      store.joinRequests = [
        ...store.joinRequests!.filter((row) => row.groupId !== "t1"),
        { ...oldRequest, id: "new-request", status: "pending" },
      ]
      const oldInvite = store.tripInvites!.find((row) => row.groupId === "t1")!
      store.tripInvites = [
        ...store.tripInvites!.filter((row) => row.groupId !== "t1"),
        { ...oldInvite, id: "new-invite", status: "pending" },
      ]
      store.contacts!.push({
        id: "new-contact", ownerProfileId: "p2", targetProfileId: "p3", source: "invite", createdAt: "2026-02-01",
      })
    })
    const updated = await loadStoreForMutationRelational(sql, { kind: "full" })
    assert.deepEqual(new Set(updated.store.joinRequests!.map((row) => row.id)), new Set(["t2-jr", "new-request"]))
    assert.deepEqual(new Set(updated.store.tripInvites!.map((row) => row.id)), new Set(["t2-inv", "new-invite"]))
    assert.deepEqual(new Set(updated.store.contacts!.map((row) => row.id)), new Set(["c-p3", "new-contact"]))
  } finally { await db.close() }
})

test("stale trip and metadata versions reject atomically; retrying with fresh state preserves both edits", async () => {
  const { db, sql } = await seeded()
  try {
    const stale = await loadStoreForMutationRelational(sql, { kind: "trip", tripId: "t1" }, "p1")
    await save(sql, (store) => { store.groups[0].expenses[0].reason = "First edit" })
    const after = structuredClone(stale.store)
    after.groups[0].expenses[1].reason = "Second edit"
    await assert.rejects(persistStoreDiffRelational(sql, stale.store, after, stale), { code: "PG_VERSION_CONFLICT" })
    await save(sql, (store) => { store.groups[0].expenses[1].reason = "Second edit" })
    const actual = await loadGroupRelational(sql, "t1")
    assert.equal(actual?.expenses[0].reason, "First edit")
    assert.equal(actual?.expenses[1].reason, "Second edit")
    const metaStale = await loadStoreForMutationRelational(sql, { kind: "trip", tripId: "t1" }, "p1")
    await save(sql, (store) => { store.contacts![0].source = "search" })
    const metaAfter = structuredClone(metaStale.store)
    metaAfter.groups[0].name = "Should roll back"
    metaAfter.tripInvites![0].status = "revoked"
    await assert.rejects(persistStoreDiffRelational(sql, metaStale.store, metaAfter, metaStale), { code: "PG_VERSION_CONFLICT" })
    assert.equal((await loadGroupRelational(sql, "t1"))?.name, "t1")
  } finally { await db.close() }
})

test("a failing child write rolls back the version and preceding rows, and cross-trip IDs cannot overwrite data", async () => {
  const { db, sql } = await seeded()
  try {
    const before = await loadGroupRelational(sql, "t1")
    const other = await loadGroupRelational(sql, "t2")
    const version = (await db.query("SELECT version FROM trips WHERE id = 't1'")).rows
    await assert.rejects(save(sql, (store) => {
      store.groups[0].name = "Should roll back"
      store.groups[0].members[0].coveredByMemberId = "missing-member"
    }))
    assert.deepEqual(await loadGroupRelational(sql, "t1"), before)
    assert.deepEqual((await db.query("SELECT version FROM trips WHERE id = 't1'")).rows, version)
    await assert.rejects(save(sql, (store) => {
      store.groups[0].expenses.push({ ...store.groups[0].expenses[0], id: "t2-e0", reason: "Collision" })
    }), /another trip/)
    assert.deepEqual(await loadGroupRelational(sql, "t2"), other)
    assert.deepEqual(await loadGroupRelational(sql, "t1"), before)
  } finally { await db.close() }
})

async function saveAll(sql: Sql, change: (store: Store) => void) { return save(sql, change, true) }
