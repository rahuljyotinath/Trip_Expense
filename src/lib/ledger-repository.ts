import postgres from "postgres"
import { storesEqual } from "./store-compare"
import {
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
  | { kind: "createTrip"; profileIds?: string[] }
  | { kind: "trip"; tripId: string; profileIds?: string[] }

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
    upi_id: n.upiId,
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
  upi_id?: string | null
  created_at: string
}): Profile {
  return normalizeProfile({
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    name: row.name,
    email: row.email,
    phone: row.phone,
    upiId: row.upi_id ?? null,
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
  tripId: string,
  versions?: Map<string, number>
): Promise<Group | null> {
  const header = await loadTripHeader(sql, tripId)
  if (!header) return null
  versions?.set(tripId, Number(header.version))
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

export async function loadProfileByUsernameRelational(
  sql: Sql,
  username: string
): Promise<Profile | null> {
  const normalized = username.trim().toLowerCase()
  if (!normalized) return null
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
    SELECT * FROM profiles WHERE lower(username) = ${normalized} LIMIT 1
  `
  return rows[0] ? rowToProfile(rows[0]) : null
}

export async function loadProfileByEmailRelational(
  sql: Sql,
  email: string
): Promise<Profile | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null
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
    SELECT * FROM profiles WHERE lower(email) = ${normalized} LIMIT 1
  `
  return rows[0] ? rowToProfile(rows[0]) : null
}

export async function loadProfileByPhoneRelational(
  sql: Sql,
  phoneDigits: string
): Promise<Profile | null> {
  if (!phoneDigits) return null
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
    SELECT * FROM profiles
    WHERE regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = ${phoneDigits}
    LIMIT 1
  `
  return rows[0] ? rowToProfile(rows[0]) : null
}

export async function loadContactsForOwnerRelational(
  sql: Sql,
  ownerProfileId: string
): Promise<Contact[]> {
  const rows = await sql<
    {
      id: string
      owner_profile_id: string
      target_profile_id: string
      source: string
      created_at: string
    }[]
  >`
    SELECT * FROM contacts
    WHERE owner_profile_id = ${ownerProfileId}
    ORDER BY created_at, id
  `
  return rows.map((r) => ({
    id: r.id,
    ownerProfileId: r.owner_profile_id,
    targetProfileId: r.target_profile_id,
    source: r.source as Contact["source"],
    createdAt: r.created_at,
  }))
}

export async function loadTripHeadersByIdsRelational(
  sql: Sql,
  tripIds: string[]
): Promise<{ id: string; name: string; code: string }[]> {
  const unique = [...new Set(tripIds.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return []
  return sql<{ id: string; name: string; code: string }[]>`
    SELECT id, name, code FROM trips WHERE id IN ${sql(unique)}
  `
}

export function profileIdsForTripMutation(
  group: Group | null,
  tripId: string,
  joinRequests: JoinRequest[],
  tripInvites: TripInvite[],
  sessionProfileId?: string | null
): string[] {
  const ids = new Set<string>()
  if (sessionProfileId?.trim()) ids.add(sessionProfileId.trim())
  if (group) {
    if (group.createdByProfileId) ids.add(group.createdByProfileId)
    for (const adminId of group.adminProfileIds ?? []) {
      if (adminId) ids.add(adminId)
    }
    for (const member of group.members) {
      if (member.profileId) ids.add(member.profileId)
    }
  }
  for (const jr of joinRequests) {
    if (jr.groupId === tripId && jr.profileId) ids.add(jr.profileId)
    if (jr.groupId === tripId && jr.decidedByProfileId) {
      ids.add(jr.decidedByProfileId)
    }
  }
  for (const inv of tripInvites) {
    if (inv.groupId !== tripId) continue
    if (inv.invitedProfileId) ids.add(inv.invitedProfileId)
    if (inv.createdByProfileId) ids.add(inv.createdByProfileId)
    if (inv.respondedByProfileId) ids.add(inv.respondedByProfileId)
  }
  return [...ids]
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

function mapJoinRequestRow(r: {
  id: string
  group_id: string
  profile_id: string
  status: string
  created_at: string
  decided_at: string | null
  decided_by_profile_id: string | null
}): JoinRequest {
  return {
    id: r.id,
    groupId: r.group_id,
    profileId: r.profile_id,
    status: r.status as JoinRequest["status"],
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decidedByProfileId: r.decided_by_profile_id,
  }
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
  return rows.map(mapJoinRequestRow)
}

export async function loadJoinRequestsForTrip(
  sql: Sql,
  tripId: string
): Promise<JoinRequest[]> {
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
  >`SELECT * FROM join_requests WHERE group_id = ${tripId} ORDER BY created_at, id`
  return rows.map(mapJoinRequestRow)
}

function mapTripInviteRow(r: {
  id: string
  group_id: string
  invited_email: string | null
  invited_phone: string | null
  invited_profile_id?: string | null
  status: string
  created_by_profile_id: string
  created_at: string
  responded_at: string | null
  responded_by_profile_id: string | null
}): TripInvite {
  return {
    id: r.id,
    groupId: r.group_id,
    invitedEmail: r.invited_email,
    invitedPhone: r.invited_phone,
    invitedProfileId: r.invited_profile_id ?? null,
    status: r.status as TripInvite["status"],
    createdByProfileId: r.created_by_profile_id,
    createdAt: r.created_at,
    respondedAt: r.responded_at,
    respondedByProfileId: r.responded_by_profile_id,
  }
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
  return rows.map(mapTripInviteRow)
}

export async function loadTripInvitesForTrip(
  sql: Sql,
  tripId: string
): Promise<TripInvite[]> {
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
  >`SELECT * FROM trip_invites WHERE group_id = ${tripId} ORDER BY created_at, id`
  return rows.map(mapTripInviteRow)
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

async function loadTripCodeStubs(sql: Sql, versions: Map<string, number>): Promise<Group[]> {
  const rows = await sql<{ id: string; code: string; version: string }[]>`
    SELECT id, code, version FROM trips ORDER BY id
  `
  return rows.map((r) => {
    versions.set(r.id, Number(r.version))
    return stubGroupForCode(r.id, r.code)
  })
}

async function loadAllGroups(sql: Sql, versions: Map<string, number>): Promise<Group[]> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM trips ORDER BY id`
  const groups: Group[] = []
  for (const row of rows) {
    const group = await loadGroupRelational(sql, row.id, versions)
    if (group) groups.push(group)
  }
  return groups
}

export async function loadFullStoreRelational(sql: Sql): Promise<RelationalLoadState> {
  const tripVersions = new Map<string, number>()
  const metaVersion = await loadMetaVersion(sql)
  const [profiles, groups, joinRequests, tripInvites, contacts] =
    await Promise.all([
      loadAllProfiles(sql),
      loadAllGroups(sql, tripVersions),
      loadJoinRequests(sql),
      loadTripInvites(sql),
      loadContacts(sql),
    ])
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
  scope: MutationScope,
  sessionProfileId: string | null = null
): Promise<RelationalLoadState> {
  const sessionId = sessionProfileId?.trim() || null
  const metaVersion = await loadMetaVersion(sql)
  const tripVersions = new Map<string, number>()
  const contextGroup = scope.kind === "trip" ? await loadGroupRelational(sql, scope.tripId, tripVersions) : null
  const owners = [...new Set([sessionId, ...(contextGroup?.members.map((m) => m.profileId) ?? [])].filter((id): id is string => Boolean(id)))]
  const [joinRequests, tripInvites, contacts] = await Promise.all([
    scope.kind === "full" ? loadJoinRequests(sql) : scope.kind === "trip" ? loadJoinRequestsForTrip(sql, scope.tripId) : Promise.resolve([]),
    scope.kind === "full" ? loadTripInvites(sql) : scope.kind === "trip" ? loadTripInvitesForTrip(sql, scope.tripId) : Promise.resolve([]),
    scope.kind === "full" ? loadContacts(sql) : Promise.all(owners.map((id) => loadContactsForOwnerRelational(sql, id))).then((lists) => lists.flat()),
  ])
  const meta = { joinRequests, tripInvites, contacts }

  if (scope.kind === "full") {
    const [profiles, groups] = await Promise.all([
      loadAllProfiles(sql),
      loadAllGroups(sql, tripVersions),
    ])
    return {
      store: normalizeStore({ profiles, groups, ...meta }),
      tripVersions,
      metaVersion,
    }
  }

  if (scope.kind === "createTrip") {
    const groups: Group[] = []
    const profiles = await loadProfilesByIdsRelational(sql, [...(sessionId ? [sessionId] : []), ...(scope.profileIds ?? [])])
    return {
      store: normalizeStore({ profiles, groups, ...meta }),
      tripVersions,
      metaVersion,
    }
  }

  const group = contextGroup
  const groups = group ? [group] : []
  const profileIds = profileIdsForTripMutation(
    group,
    scope.tripId,
    joinRequests,
    tripInvites,
    sessionId
  )
  const profiles = await loadProfilesByIdsRelational(sql, [...profileIds, ...(scope.profileIds ?? [])])
  return {
    store: normalizeStore({ profiles, groups, ...meta }),
    tripVersions,
    metaVersion,
  }
}

function changedRows<T extends { id: string }>(before: T[], after: T[]): T[] {
  const previous = new Map(before.map((row) => [row.id, row]))
  return after.filter((row) => JSON.stringify(previous.get(row.id)) !== JSON.stringify(row))
}

async function deleteRemovedRows<T extends { id: string }>(
  sql: Sql,
  table: string,
  before: T[],
  after: T[]
) {
  const retained = new Set(after.map((row) => row.id))
  const removed = before.filter((row) => !retained.has(row.id)).map((row) => row.id)
  if (removed.length) await sql`DELETE FROM ${sql(table)} WHERE id IN ${sql(removed)}`
}

async function persistTripChildrenDiff(sql: Sql, tripId: string, before: Group | undefined, group: Group) {
  const old = before ? normalizeGroup(before) : null
  await deleteRemovedRows(sql, "payments", old?.payments ?? [], group.payments)
  await deleteRemovedRows(sql, "expenses", old?.expenses ?? [], group.expenses)

  const g = normalizeGroup(group)
  for (const member of changedRows(old?.members ?? [], g.members)) {
    const written = await sql`
      INSERT INTO members (id, trip_id, name, profile_id, covered_by_member_id)
      VALUES (
        ${member.id},
        ${tripId},
        ${member.name},
        ${member.profileId},
        ${null}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        profile_id = EXCLUDED.profile_id,
        covered_by_member_id = EXCLUDED.covered_by_member_id
      WHERE members.trip_id = EXCLUDED.trip_id
      RETURNING id
    `
    if (written.length === 0) throw new Error("Record ID belongs to another trip.")
  }
  for (const member of changedRows(old?.members ?? [], g.members)) {
    if (member.coveredByMemberId) {
      await sql`
        UPDATE members
        SET covered_by_member_id = ${member.coveredByMemberId}
        WHERE id = ${member.id} AND trip_id = ${tripId}
      `
    }
  }

  for (const expense of changedRows(old?.expenses ?? [], g.expenses)) {
    const written = await sql`
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
      ON CONFLICT (id) DO UPDATE SET
        date = EXCLUDED.date,
        amount = EXCLUDED.amount,
        reason = EXCLUDED.reason,
        paid_by_member_id = EXCLUDED.paid_by_member_id,
        participant_ids = EXCLUDED.participant_ids,
        split = EXCLUDED.split,
        shares = EXCLUDED.shares,
        created_by_profile_id = EXCLUDED.created_by_profile_id,
        created_at = EXCLUDED.created_at,
        voided_at = EXCLUDED.voided_at,
        voided_by_profile_id = EXCLUDED.voided_by_profile_id
      WHERE expenses.trip_id = EXCLUDED.trip_id
      RETURNING id
    `
    if (written.length === 0) throw new Error("Record ID belongs to another trip.")
  }

  for (const payment of changedRows(old?.payments ?? [], g.payments)) {
    const written = await sql`
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
      ON CONFLICT (id) DO UPDATE SET
        date = EXCLUDED.date,
        amount = EXCLUDED.amount,
        from_member_id = EXCLUDED.from_member_id,
        to_member_id = EXCLUDED.to_member_id,
        created_by_profile_id = EXCLUDED.created_by_profile_id,
        created_at = EXCLUDED.created_at,
        voided_at = EXCLUDED.voided_at,
        voided_by_profile_id = EXCLUDED.voided_by_profile_id
      WHERE payments.trip_id = EXCLUDED.trip_id
      RETURNING id
    `
    if (written.length === 0) throw new Error("Record ID belongs to another trip.")
  }

  await deleteRemovedRows(sql, "members", old?.members ?? [], g.members)
  const oldAdmins = old?.adminProfileIds ?? []
  const admins = g.adminProfileIds ?? []
  const removedAdmins = oldAdmins.filter((id) => !admins.includes(id))
  if (removedAdmins.length) {
    await sql`DELETE FROM trip_admin_profiles WHERE trip_id = ${tripId} AND profile_id IN ${sql(removedAdmins)}`
  }
  for (const adminId of admins.filter((id) => !oldAdmins.includes(id))) {
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
      id, username, password_hash, name, email, phone, upi_id, created_at
    ) VALUES (
      ${row.id},
      ${row.username},
      ${row.password_hash},
      ${row.name},
      ${row.email},
      ${row.phone},
      ${row.upi_id},
      ${row.created_at}
    )
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      password_hash = EXCLUDED.password_hash,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      upi_id = EXCLUDED.upi_id,
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

  await deleteRemovedRows(sql, "join_requests", b.joinRequests ?? [], a.joinRequests ?? [])
  for (const jr of changedRows(b.joinRequests ?? [], a.joinRequests ?? [])) {
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
    ON CONFLICT (id) DO UPDATE SET
      group_id = EXCLUDED.group_id,
      profile_id = EXCLUDED.profile_id,
      status = EXCLUDED.status,
      created_at = EXCLUDED.created_at,
      decided_at = EXCLUDED.decided_at,
      decided_by_profile_id = EXCLUDED.decided_by_profile_id
    `
  }

  await deleteRemovedRows(sql, "trip_invites", b.tripInvites ?? [], a.tripInvites ?? [])
  for (const inv of changedRows(b.tripInvites ?? [], a.tripInvites ?? [])) {
    await sql`
      INSERT INTO trip_invites (
        id, group_id, invited_email, invited_phone, invited_profile_id, status,
        created_by_profile_id, created_at, responded_at, responded_by_profile_id
      ) VALUES (
        ${inv.id},
        ${inv.groupId},
        ${inv.invitedEmail},
        ${inv.invitedPhone},
        ${inv.invitedProfileId ?? null},
        ${inv.status},
        ${inv.createdByProfileId},
        ${inv.createdAt},
        ${inv.respondedAt},
        ${inv.respondedByProfileId}
      )
    ON CONFLICT (id) DO UPDATE SET
      group_id = EXCLUDED.group_id,
      invited_email = EXCLUDED.invited_email,
      invited_phone = EXCLUDED.invited_phone,
      invited_profile_id = EXCLUDED.invited_profile_id,
      status = EXCLUDED.status,
      created_by_profile_id = EXCLUDED.created_by_profile_id,
      created_at = EXCLUDED.created_at,
      responded_at = EXCLUDED.responded_at,
      responded_by_profile_id = EXCLUDED.responded_by_profile_id
    `
  }

  await deleteRemovedRows(sql, "contacts", b.contacts ?? [], a.contacts ?? [])
  for (const c of changedRows(b.contacts ?? [], a.contacts ?? [])) {
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
    ON CONFLICT (id) DO UPDATE SET
      owner_profile_id = EXCLUDED.owner_profile_id,
      target_profile_id = EXCLUDED.target_profile_id,
      source = EXCLUDED.source,
      created_at = EXCLUDED.created_at
    `
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

      await persistTripChildrenDiff(conn, g.id, old, g)
    }

    await persistMeta(conn, prev, next, state.metaVersion)
  })
}

export async function loadGroupsForProfileRelational(
  sql: Sql,
  profileId: string
): Promise<Group[]> {
  const rows = await sql<{ data: Group }[]>`
    SELECT jsonb_build_object(
      'id', t.id, 'name', t.name, 'code', t.code, 'currency', t.currency,
      'startDate', t.start_date, 'endDate', t.end_date,
      'createdByProfileId', t.created_by_profile_id, 'createdAt', t.created_at,
      'joinApprovalRequired', t.join_approval_required, 'ledgerDayOrder', t.ledger_day_order,
      'adminProfileIds', COALESCE((SELECT jsonb_agg(a.profile_id)
        FROM trip_admin_profiles a WHERE a.trip_id = t.id), '[]'::jsonb),
      'members', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'profileId', m.profile_id,
        'coveredByMemberId', m.covered_by_member_id
      ) ORDER BY m.id) FROM members m WHERE m.trip_id = t.id), '[]'::jsonb),
      'expenses', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'date', e.date,
        'amount', e.amount,
        'reason', e.reason,
        'paidByMemberId', e.paid_by_member_id,
        'participantIds', e.participant_ids,
        'split', e.split,
        'shares', e.shares,
        'createdByProfileId', e.created_by_profile_id,
        'createdAt', e.created_at,
        'voidedAt', e.voided_at,
        'voidedByProfileId', e.voided_by_profile_id
      ) ORDER BY e.created_at, e.id) FROM expenses e WHERE e.trip_id = t.id), '[]'::jsonb),
      'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'date', p.date,
        'amount', p.amount,
        'fromMemberId', p.from_member_id,
        'toMemberId', p.to_member_id,
        'createdByProfileId', p.created_by_profile_id,
        'createdAt', p.created_at,
        'voidedAt', p.voided_at,
        'voidedByProfileId', p.voided_by_profile_id
      ) ORDER BY p.created_at, p.id) FROM payments p WHERE p.trip_id = t.id), '[]'::jsonb)
    ) AS data
    FROM trips t
    WHERE t.id IN (SELECT trip_id FROM members WHERE profile_id = ${profileId})
    ORDER BY t.id
  `
  return rows.map((row) => normalizeGroup(row.data))
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
    await conn`LOCK TABLE profiles, trips IN EXCLUSIVE MODE`
    const occupied = await conn<{ occupied: boolean }[]>`SELECT EXISTS(SELECT 1 FROM profiles) OR EXISTS(SELECT 1 FROM trips) AS occupied`
    if (occupied[0]?.occupied) throw new Error("Cannot backfill a populated relational ledger. Restore into a new database instead.")
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
      await persistTripChildrenDiff(conn, g.id, undefined, g)
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
          id, group_id, invited_email, invited_phone, invited_profile_id, status,
          created_by_profile_id, created_at, responded_at, responded_by_profile_id
        ) VALUES (
          ${inv.id},
          ${inv.groupId},
          ${inv.invitedEmail},
          ${inv.invitedPhone},
        ${inv.invitedProfileId ?? null},
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
