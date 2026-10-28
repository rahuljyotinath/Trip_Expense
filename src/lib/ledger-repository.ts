import postgres from "postgres"
import { storesEqual } from "./store-compare"
import {
  emptyStore,
  normalizeGroup,
  normalizeProfile,
  normalizeStore,
  type Contact,
  type Expense,
  type Group,
  type JoinRequest,
  type Payment,
  type Profile,
  type Store,
  type TripInvite,
} from "./types"

export type Sql = ReturnType<typeof postgres>

export type MutationScope =
  | { kind: "full" }
  | { kind: "createTrip" }
  | { kind: "trip"; tripId: string }

export type RelationalLoadState = {
  store: Store
  tripVersions: Map<string, number>
  metaVersion: number
}

const META_ID = "main"

function groupSnapshot(group: Group) {
  return JSON.stringify(normalizeGroup(group))
}

export function profileForDb(p: Profile): Profile {
  const n = normalizeProfile(p)
  if (n.username.trim()) return n
  const slug = n.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "legacy"
  return { ...n, username: `legacy_${slug}` }
}

function profileRow(p: Profile) {
  const n = profileForDb(p)
  return {
    id: n.id,
    username: n.username,
    password_hash: n.passwordHash,
    name: n.name,
    email: n.email,
    phone: n.phone,
    created_at: n.createdAt,
  }
}

function rowToProfile(row: {
  id: string
  username: string
  password_hash: string
  name: string
  email: string | null
  phone: string | null
  created_at: string
}): Profile {
  return normalizeProfile({
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    name: row.name,
    email: row.email,
    phone: row.phone,
    createdAt: row.created_at,
  })
}

async function loadAdminIds(sql: Sql, tripId: string): Promise<string[]> {
  const rows = await sql<{ profile_id: string }[]>`
    SELECT profile_id FROM trip_admin_profiles WHERE trip_id = ${tripId}
  `
  return rows.map((r) => r.profile_id)
}

async function loadMembers(sql: Sql, tripId: string) {
  const rows = await sql<
    {
      id: string
      name: string
      profile_id: string | null
      covered_by_member_id: string | null
    }[]
  >`
    SELECT id, name, profile_id, covered_by_member_id
    FROM members
    WHERE trip_id = ${tripId}
    ORDER BY id
  `
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    profileId: r.profile_id,
    coveredByMemberId: r.covered_by_member_id,
  }))
}

async function loadExpenses(sql: Sql, tripId: string): Promise<Expense[]> {
  const rows = await sql<
    {
      id: string
      date: string
      amount: number
      reason: string
      paid_by_member_id: string
      participant_ids: unknown
      split: string
      shares: unknown
      created_by_profile_id: string
      created_at: string
      voided_at: string | null
      voided_by_profile_id: string | null
    }[]
  >`
    SELECT * FROM expenses WHERE trip_id = ${tripId} ORDER BY created_at, id
  `
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    amount: r.amount,
    reason: r.reason,
    paidByMemberId: r.paid_by_member_id,
    participantIds: Array.isArray(r.participant_ids)
      ? (r.participant_ids as string[])
      : [],
    split: r.split === "percent" ? "percent" : "equal",
    shares: (r.shares && typeof r.shares === "object"
      ? r.shares
      : {}) as Record<string, number>,
    createdByProfileId: r.created_by_profile_id,
    createdAt: r.created_at,
    voidedAt: r.voided_at,
    voidedByProfileId: r.voided_by_profile_id,
  }))
}

async function loadPayments(sql: Sql, tripId: string): Promise<Payment[]> {
  const rows = await sql<
    {
      id: string
      date: string
      amount: number
      from_member_id: string
      to_member_id: string
      created_by_profile_id: string
      created_at: string
      voided_at: string | null
      voided_by_profile_id: string | null
    }[]
  >`
    SELECT * FROM payments WHERE trip_id = ${tripId} ORDER BY created_at, id
  `
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    amount: r.amount,
    fromMemberId: r.from_member_id,
    toMemberId: r.to_member_id,
    createdByProfileId: r.created_by_profile_id,
    createdAt: r.created_at,
    voidedAt: r.voided_at,
    voidedByProfileId: r.voided_by_profile_id,
  }))
}

async function loadTripHeader(sql: Sql, tripId: string) {
  const rows = await sql<
    {
      id: string
      name: string
      code: string
      currency: string
      start_date: string | null
      end_date: string | null
      created_by_profile_id: string
      created_at: string
      join_approval_required: boolean
      ledger_day_order: unknown
      version: string
    }[]
  >`
    SELECT * FROM trips WHERE id = ${tripId}
  `
  return rows[0] ?? null
}

export async function loadGroupRelational(
  sql: Sql,
  tripId: string
): Promise<Group | null> {
  const header = await loadTripHeader(sql, tripId)
  if (!header) return null
  const [members, expenses, payments, adminProfileIds] = await Promise.all([
    loadMembers(sql, tripId),
    loadExpenses(sql, tripId),
    loadPayments(sql, tripId),
    loadAdminIds(sql, tripId),
  ])
  return normalizeGroup({
    id: header.id,
    name: header.name,
    code: header.code,
    currency: header.currency,
    startDate: header.start_date,
    endDate: header.end_date,
    createdByProfileId: header.created_by_profile_id,
    createdAt: header.created_at,
    joinApprovalRequired: header.join_approval_required,
    ledgerDayOrder:
      header.ledger_day_order && typeof header.ledger_day_order === "object"
        ? (header.ledger_day_order as Record<string, string[]>)
        : undefined,
    adminProfileIds,
    members,
    expenses,
    payments,
  })
}

function stubGroupForCode(id: string, code: string): Group {
  return normalizeGroup({
    id,
    name: "",
    code,
    currency: "INR",
    startDate: null,
    endDate: null,
    createdByProfileId: "",
    createdAt: "",
    members: [],
    expenses: [],
    payments: [],
  })
}

export async function loadAllProfiles(sql: Sql): Promise<Profile[]> {
  const rows = await sql<
    {
      id: string
      username: string
      password_hash: string
      name: string
      email: string | null
      phone: string | null
      created_at: string
    }[]
  >`SELECT * FROM profiles ORDER BY created_at, id`
  return rows.map(rowToProfile)
}

async function loadMetaVersion(sql: Sql): Promise<number> {
  const rows = await sql<{ version: string }[]>`
    SELECT version FROM ledger_meta WHERE id = ${META_ID}
  `
  return rows[0] ? Number(rows[0].version) : 1
}

export async function loadJoinRequests(sql: Sql): Promise<JoinRequest[]> {
  const rows = await sql<
    {
      id: string
      group_id: string
      profile_id: string
      status: string
      created_at: string
      decided_at: string | null
      decided_by_profile_id: string | null
    }[]
  >`SELECT * FROM join_requests ORDER BY created_at, id`
  return rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    profileId: r.profile_id,
    status: r.status as JoinRequest["status"],
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decidedByProfileId: r.decided_by_profile_id,
  }))
}

export async function loadTripInvites(sql: Sql): Promise<TripInvite[]> {
  const rows = await sql<
    {
      id: string
      group_id: string
      invited_email: string | null
      invited_phone: string | null
      status: string
      created_by_profile_id: string
      created_at: string
      responded_at: string | null
      responded_by_profile_id: string | null
    }[]
  >`SELECT * FROM trip_invites ORDER BY created_at, id`
  return rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    invitedEmail: r.invited_email,
    invitedPhone: r.invited_phone,
    status: r.status as TripInvite["status"],
    createdByProfileId: r.created_by_profile_id,
    createdAt: r.created_at,
    respondedAt: r.responded_at,
    respondedByProfileId: r.responded_by_profile_id,
  }))
}

export async function loadContacts(sql: Sql): Promise<Contact[]> {
  const rows = await sql<
    {
      id: string
      owner_profile_id: string
      target_profile_id: string
      source: string
      created_at: string
    }[]
  >`SELECT * FROM contacts ORDER BY created_at, id`
  return rows.map((r) => ({
    id: r.id,
    ownerProfileId: r.owner_profile_id,
    targetProfileId: r.target_profile_id,
    source: r.source as Contact["source"],
    createdAt: r.created_at,
  }))
}

async function loadTripCodeStubs(sql: Sql): Promise<Group[]> {
  const rows = await sql<{ id: string; code: string }[]>`
    SELECT id, code FROM trips ORDER BY id
  `
  return rows.map((r) => stubGroupForCode(r.id, r.code))
}

async function loadAllGroups(sql: Sql): Promise<Group[]> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM trips ORDER BY id`
  const groups: Group[] = []
  for (const row of rows) {
    const group = await loadGroupRelational(sql, row.id)
    if (group) groups.push(group)
  }
  return groups
}

export async function loadFullStoreRelational(sql: Sql): Promise<RelationalLoadState> {
  const [profiles, groups, joinRequests, tripInvites, contacts, metaVersion] =
    await Promise.all([
      loadAllProfiles(sql),
      loadAllGroups(sql),
      loadJoinRequests(sql),
      loadTripInvites(sql),
      loadContacts(sql),
      loadMetaVersion(sql),
    ])
  const tripVersions = new Map<string, number>()
  for (const g of groups) {
    const header = await loadTripHeader(sql, g.id)
    if (header) tripVersions.set(g.id, Number(header.version))
  }
  return {
    store: normalizeStore({
      profiles,
      groups,
      joinRequests,
      tripInvites,
      contacts,
    }),
    tripVersions,
    metaVersion,
  }
}

export async function loadStoreForMutationRelational(
  sql: Sql,
  scope: MutationScope
): Promise<RelationalLoadState> {
  const [profiles, joinRequests, tripInvites, contacts, metaVersion] =
    await Promise.all([
      loadAllProfiles(sql),
      loadJoinRequests(sql),
      loadTripInvites(sql),
      loadContacts(sql),
      loadMetaVersion(sql),
    ])
  const meta = { joinRequests, tripInvites, contacts }
  const tripVersions = new Map<string, number>()

  if (scope.kind === "full") {
    const groups = await loadAllGroups(sql)
    for (const g of groups) {
      const header = await loadTripHeader(sql, g.id)
      if (header) tripVersions.set(g.id, Number(header.version))
    }
    return {
      store: normalizeStore({ profiles, groups, ...meta }),
      tripVersions,
      metaVersion,
    }
  }

  if (scope.kind === "createTrip") {
    const groups = await loadTripCodeStubs(sql)
    for (const g of groups) {
      const header = await loadTripHeader(sql, g.id)
      if (header) tripVersions.set(g.id, Number(header.version))
    }
    return {
      store: normalizeStore({ profiles, groups, ...meta }),
      tripVersions,
      metaVersion,
    }
  }

  const group = await loadGroupRelational(sql, scope.tripId)
  const groups = group ? [group] : []
  if (group) {
    const header = await loadTripHeader(sql, scope.tripId)
    if (header) tripVersions.set(scope.tripId, Number(header.version))
  }
  return {
    store: normalizeStore({ profiles, groups, ...meta }),
    tripVersions,
    metaVersion,
  }
}

async function persistTripChildren(sql: Sql, tripId: string, group: Group) {
  await sql`DELETE FROM payments WHERE trip_id = ${tripId}`
  await sql`DELETE FROM expenses WHERE trip_id = ${tripId}`
  await sql`DELETE FROM members WHERE trip_id = ${tripId}`

  const g = normalizeGroup(group)
  for (const member of g.members) {
    await sql`
      INSERT INTO members (id, trip_id, name, profile_id, covered_by_member_id)
      VALUES (
        ${member.id},
        ${tripId},
        ${member.name},
        ${member.profileId},
        ${null}
      )
    `
  }
  for (const member of g.members) {
    if (member.coveredByMemberId) {
      await sql`
        UPDATE members
        SET covered_by_member_id = ${member.coveredByMemberId}
        WHERE id = ${member.id} AND trip_id = ${tripId}
      `
    }
  }

  for (const expense of g.expenses) {
    await sql`
      INSERT INTO expenses (
        id, trip_id, date, amount, reason, paid_by_member_id,
        participant_ids, split, shares, created_by_profile_id,
        created_at, voided_at, voided_by_profile_id
      ) VALUES (
        ${expense.id},
        ${tripId},
        ${expense.date},
        ${expense.amount},
        ${expense.reason},
        ${expense.paidByMemberId},
        ${sql.json(expense.participantIds)},
        ${expense.split},
        ${sql.json(expense.shares)},
        ${expense.createdByProfileId},
        ${expense.createdAt},
        ${expense.voidedAt},
        ${expense.voidedByProfileId}
      )
    `
  }

  for (const payment of g.payments) {
    await sql`
      INSERT INTO payments (
        id, trip_id, date, amount, from_member_id, to_member_id,
        created_by_profile_id, created_at, voided_at, voided_by_profile_id
      ) VALUES (
        ${payment.id},
        ${tripId},
        ${payment.date},
        ${payment.amount},
        ${payment.fromMemberId},
        ${payment.toMemberId},
        ${payment.createdByProfileId},
        ${payment.createdAt},
        ${payment.voidedAt},
        ${payment.voidedByProfileId}
      )
    `
  }

  await sql`DELETE FROM trip_admin_profiles WHERE trip_id = ${tripId}`
  for (const adminId of g.adminProfileIds ?? []) {
    if (adminId && adminId !== g.createdByProfileId) {
      await sql`
        INSERT INTO trip_admin_profiles (trip_id, profile_id)
        VALUES (${tripId}, ${adminId})
        ON CONFLICT DO NOTHING
      `
    }
  }
}

async function upsertProfile(sql: Sql, profile: Profile) {
  const row = profileRow(profile)
  await sql`
    INSERT INTO profiles (
      id, username, password_hash, name, email, phone, created_at
    ) VALUES (
      ${row.id},
      ${row.username},
      ${row.password_hash},
      ${row.name},
      ${row.email},
      ${row.phone},
      ${row.created_at}
    )
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      password_hash = EXCLUDED.password_hash,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      created_at = EXCLUDED.created_at
  `
}

async function persistMeta(
  sql: Sql,
  before: Store,
  after: Store,
  expectedMetaVersion: number
) {
  const b = normalizeStore(before)
  const a = normalizeStore(after)
  const metaChanged =
    JSON.stringify(b.joinRequests ?? []) !== JSON.stringify(a.joinRequests ?? []) ||
    JSON.stringify(b.tripInvites ?? []) !== JSON.stringify(a.tripInvites ?? []) ||
    JSON.stringify(b.contacts ?? []) !== JSON.stringify(a.contacts ?? [])

  if (!metaChanged) return

  await sql`DELETE FROM join_requests`
  for (const jr of a.joinRequests ?? []) {
    await sql`
      INSERT INTO join_requests (
        id, group_id, profile_id, status, created_at, decided_at, decided_by_profile_id
      ) VALUES (
        ${jr.id},
        ${jr.groupId},
        ${jr.profileId},
        ${jr.status},
        ${jr.createdAt},
        ${jr.decidedAt},
        ${jr.decidedByProfileId}
      )
    `
  }

  await sql`DELETE FROM trip_invites`
  for (const inv of a.tripInvites ?? []) {
    await sql`
      INSERT INTO trip_invites (
        id, group_id, invited_email, invited_phone, status,
        created_by_profile_id, created_at, responded_at, responded_by_profile_id
      ) VALUES (
        ${inv.id},
        ${inv.groupId},
        ${inv.invitedEmail},
        ${inv.invitedPhone},
        ${inv.status},
        ${inv.createdByProfileId},
        ${inv.createdAt},
        ${inv.respondedAt},
        ${inv.respondedByProfileId}
      )
    `
  }

  await sql`DELETE FROM contacts`
  for (const c of a.contacts ?? []) {
    await sql`
      INSERT INTO contacts (
        id, owner_profile_id, target_profile_id, source, created_at
      ) VALUES (
        ${c.id},
        ${c.ownerProfileId},
        ${c.targetProfileId},
        ${c.source},
        ${c.createdAt}
      )
    `
  }

  const updated = await sql<{ version: string }[]>`
    UPDATE ledger_meta
    SET version = version + 1
    WHERE id = ${META_ID} AND version = ${expectedMetaVersion}
    RETURNING version
  `
  if (updated.length === 0) {
    const err = new Error("Postgres meta version conflict.") as Error & { code: string }
    err.code = "PG_VERSION_CONFLICT"
    throw err
  }
}

function versionConflict() {
  const err = new Error("Postgres version conflict.") as Error & { code: string }
  err.code = "PG_VERSION_CONFLICT"
  return err
}

export async function persistStoreDiffRelational(
  sql: Sql,
  before: Store,
  after: Store,
  state: RelationalLoadState
) {
  const prev = normalizeStore(before)
  const next = normalizeStore(after)

  await sql.begin(async (tx) => {
    const conn = tx as unknown as Sql

    for (const profile of next.profiles) {
      const old = prev.profiles.find((p) => p.id === profile.id)
      const nextRow = profileForDb(profile)
      const oldRow = old ? profileForDb(old) : null
      if (!oldRow || JSON.stringify(oldRow) !== JSON.stringify(nextRow)) {
        await upsertProfile(conn, nextRow)
      }
    }

    const beforeIds = new Set(prev.groups.map((g) => g.id))
    const afterIds = new Set(next.groups.map((g) => g.id))

    for (const id of beforeIds) {
      if (!afterIds.has(id)) {
        await conn`DELETE FROM trips WHERE id = ${id}`
      }
    }

    for (const group of next.groups) {
      const old = prev.groups.find((g) => g.id === group.id)
      if (old && groupSnapshot(old) === groupSnapshot(group)) continue

      const g = normalizeGroup(group)
      const expectedVersion = state.tripVersions.get(g.id)

      if (expectedVersion === undefined) {
        await conn`
          INSERT INTO trips (
            id, name, code, currency, start_date, end_date,
            created_by_profile_id, created_at, join_approval_required,
            ledger_day_order, version
          ) VALUES (
            ${g.id},
            ${g.name},
            ${g.code},
            ${g.currency},
            ${g.startDate},
            ${g.endDate},
            ${g.createdByProfileId},
            ${g.createdAt},
            ${g.joinApprovalRequired ?? false},
            ${g.ledgerDayOrder ? conn.json(g.ledgerDayOrder) : null},
            1
          )
        `
      } else {
        const updated = await conn<{ version: string }[]>`
          UPDATE trips SET
            name = ${g.name},
            code = ${g.code},
            currency = ${g.currency},
            start_date = ${g.startDate},
            end_date = ${g.endDate},
            created_by_profile_id = ${g.createdByProfileId},
            created_at = ${g.createdAt},
            join_approval_required = ${g.joinApprovalRequired ?? false},
            ledger_day_order = ${g.ledgerDayOrder ? conn.json(g.ledgerDayOrder) : null},
            version = version + 1
          WHERE id = ${g.id} AND version = ${expectedVersion}
          RETURNING version
        `
        if (updated.length === 0) throw versionConflict()
      }

      await persistTripChildren(conn, g.id, g)
    }

    await persistMeta(conn, prev, next, state.metaVersion)
  })
}

export async function loadGroupsForProfileRelational(
  sql: Sql,
  profileId: string
): Promise<Group[]> {
  const rows = await sql<{ trip_id: string }[]>`
    SELECT DISTINCT trip_id FROM members WHERE profile_id = ${profileId}
  `
  const groups: Group[] = []
  for (const row of rows) {
    const group = await loadGroupRelational(sql, row.trip_id)
    if (group) groups.push(group)
  }
  return groups
}

export async function loadGroupByCodeRelational(
  sql: Sql,
  code: string
): Promise<Group | null> {
  const normalized = code.replace(/\s+/g, "").toUpperCase()
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM trips WHERE code = ${normalized} LIMIT 1
  `
  if (!rows[0]) return null
  return loadGroupRelational(sql, rows[0].id)
}

export async function loadProfilesByIdsRelational(
  sql: Sql,
  ids: string[]
): Promise<Profile[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return []
  const rows = await sql<
    {
      id: string
      username: string
      password_hash: string
      name: string
      email: string | null
      phone: string | null
      created_at: string
    }[]
  >`
    SELECT * FROM profiles WHERE id IN ${sql(unique)}
  `
  return rows.map(rowToProfile)
}

export async function readLedgerStatsRelational(sql: Sql) {
  const rows = await sql<
    {
      profiles: string
      trips: string
      expenses: string
      payments: string
      blob_bytes: number | null
    }[]
  >`
    SELECT
      (SELECT count(*)::text FROM profiles) AS profiles,
      (SELECT count(*)::text FROM trips) AS trips,
      (SELECT count(*)::text FROM expenses) AS expenses,
      (SELECT count(*)::text FROM payments) AS payments,
      (SELECT octet_length(data::text)::int FROM ledger_store WHERE id = 'main') AS blob_bytes
  `
  return rows[0] ?? null
}

/** Import entire store into relational tables (migration). */
export async function importStoreToRelational(sql: Sql, store: Store) {
  const normalized = normalizeStore(store)
  await sql.begin(async (tx) => {
    const conn = tx as unknown as Sql
    await conn`DELETE FROM payments`
    await conn`DELETE FROM expenses`
    await conn`DELETE FROM members`
    await conn`DELETE FROM trip_admin_profiles`
    await conn`DELETE FROM join_requests`
    await conn`DELETE FROM trip_invites`
    await conn`DELETE FROM contacts`
    await conn`DELETE FROM trips`
    await conn`DELETE FROM profiles`

    for (const profile of normalized.profiles) {
      await upsertProfile(conn, profileForDb(profile))
    }

    for (const group of normalized.groups) {
      const g = normalizeGroup(group)
      await conn`
        INSERT INTO trips (
          id, name, code, currency, start_date, end_date,
          created_by_profile_id, created_at, join_approval_required,
          ledger_day_order, version
        ) VALUES (
          ${g.id},
          ${g.name},
          ${g.code},
          ${g.currency},
          ${g.startDate},
          ${g.endDate},
          ${g.createdByProfileId},
          ${g.createdAt},
          ${g.joinApprovalRequired ?? false},
          ${g.ledgerDayOrder ? conn.json(g.ledgerDayOrder) : null},
          1
        )
      `
      await persistTripChildren(conn, g.id, g)
    }

    for (const jr of normalized.joinRequests ?? []) {
      await conn`
        INSERT INTO join_requests (
          id, group_id, profile_id, status, created_at, decided_at, decided_by_profile_id
        ) VALUES (
          ${jr.id},
          ${jr.groupId},
          ${jr.profileId},
          ${jr.status},
          ${jr.createdAt},
          ${jr.decidedAt},
          ${jr.decidedByProfileId}
        )
      `
    }

    for (const inv of normalized.tripInvites ?? []) {
      await conn`
        INSERT INTO trip_invites (
          id, group_id, invited_email, invited_phone, status,
          created_by_profile_id, created_at, responded_at, responded_by_profile_id
        ) VALUES (
          ${inv.id},
          ${inv.groupId},
          ${inv.invitedEmail},
          ${inv.invitedPhone},
          ${inv.status},
          ${inv.createdByProfileId},
          ${inv.createdAt},
          ${inv.respondedAt},
          ${inv.respondedByProfileId}
        )
      `
    }

    for (const c of normalized.contacts ?? []) {
      await conn`
        INSERT INTO contacts (
          id, owner_profile_id, target_profile_id, source, created_at
        ) VALUES (
          ${c.id},
          ${c.ownerProfileId},
          ${c.targetProfileId},
          ${c.source},
          ${c.createdAt}
        )
      `
    }

    await conn`
      INSERT INTO ledger_meta (id, version) VALUES (${META_ID}, 1)
      ON CONFLICT (id) DO UPDATE SET version = ledger_meta.version + 1
    `
  })
}

export function storesEqualNormalized(a: Store, b: Store) {
  return storesEqual(normalizeStore(a), normalizeStore(b))
}
