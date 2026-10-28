import { ledgerDaysForViewer } from "@/lib/ledger-display"
import { isGroupMember } from "@/lib/trip-access"
import {
  appendLedgerDayOrder,
  expectedLedgerDayIds,
  moveIdBetweenLedgerDays,
  removeIdFromLedgerDayOrder,
  setLedgerDayOrder,
} from "@/lib/ledger-day-order"
import { joinCode, nowIso, uid } from "@/lib/ids"
import { sharesComplete } from "@/lib/shares"
import { parseTripCsv } from "@/lib/trip-csv"
import {
  normalizeInviteEmail,
  normalizeInvitePhone,
  isTripAdmin,
  profileMatchesInvite,
  joinRequestForProfile,
} from "@/lib/trip-invites"
import {
  findProfileForContactSearch,
  listContactsForProfile,
  removeContactFromStore,
  syncTripContacts,
  upsertContactInStore,
} from "@/lib/trip-contacts"
import {
  normalizeGroup,
  type Expense,
  type Group,
  type JoinRequest,
  type Payment,
  type Profile,
  type SplitMode,
  type ContactSource,
  type Store,
  type TripInvite,
} from "@/lib/types"

function cleanName(raw: string, max: number) {
  const name = raw.replace(/\s+/g, " ").trim()
  if (name.length < 1 || name.length > max) return null
  return name
}

function requireGroup(store: Store, groupId: string) {
  const group = store.groups.find((item) => item.id === groupId)
  if (!group) throw new Error("Trip not found.")
  return group
}

function replaceGroup(store: Store, group: Group): Store {
  return {
    ...store,
    groups: store.groups.map((item) => (item.id === group.id ? group : item)),
  }
}

export function createProfile(store: Store, rawName: string) {
  const name = cleanName(rawName, 40)
  if (!name) throw new Error("Give a real name. 1–40 characters.")
  const profile: Profile = {
    id: uid("p"),
    username: "",
    passwordHash: "",
    name,
    email: null,
    phone: null,
    createdAt: nowIso(),
  }
  return {
    store: { ...store, profiles: [...store.profiles, profile] },
    profile,
  }
}

export function createGroup(
  store: Store,
  input: {
    name: string
    currency?: string
    startDate?: string | null
    endDate?: string | null
    memberNames: string[]
    createdByProfileId: string
  }
) {
  const profile = store.profiles.find((item) => item.id === input.createdByProfileId)
  if (!profile) throw new Error("Set up your profile first.")

  const name = cleanName(input.name, 60)
  if (!name) throw new Error("Trip needs a name.")

  const currency = (input.currency ?? "INR").toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code.")

  const names = input.memberNames
    .map((item) => cleanName(item, 40))
    .filter((item): item is string => Boolean(item))

  if (!names.some((item) => item.toLowerCase() === profile.name.toLowerCase())) {
    names.unshift(profile.name)
  }

  const unique: string[] = []
  for (const item of names) {
    if (!unique.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
      unique.push(item)
    }
  }
  if (unique.length < 2) throw new Error("A trip needs at least two names.")

  let code = joinCode()
  while (store.groups.some((group) => group.code === code)) {
    code = joinCode()
  }

  const startDate = parseOptionalDate(input.startDate)
  const endDate = parseOptionalDate(input.endDate)
  if (startDate && endDate && startDate > endDate) {
    throw new Error("End date must be on or after the start date.")
  }

  const group: Group = {
    id: uid("g"),
    name,
    code,
    currency,
    startDate,
    endDate,
    createdByProfileId: profile.id,
    createdAt: nowIso(),
    members: unique.map((memberName) => ({
      id: uid("m"),
      name: memberName,
      profileId:
        memberName.toLowerCase() === profile.name.toLowerCase() ? profile.id : null,
      coveredByMemberId: null,
    })),
    expenses: [],
    payments: [],
    joinApprovalRequired: true,
  }

  return {
    store: { ...store, groups: [group, ...store.groups] },
    group,
  }
}

export function updateGroup(
  store: Store,
  input: {
    groupId: string
    profileId: string
    name?: string
    startDate?: string | null
    endDate?: string | null
  }
) {
  const group = requireGroup(store, input.groupId)
  if (!isTripAdmin(group, input.profileId)) {
    throw new Error("Only a trip admin can edit trip details.")
  }
  requireSeated(group, input.profileId)

  const name =
    input.name === undefined ? group.name : cleanName(input.name, 60)
  if (!name) throw new Error("Trip needs a name.")

  const startDate =
    input.startDate === undefined
      ? group.startDate
      : parseOptionalDate(input.startDate)
  const endDate =
    input.endDate === undefined ? group.endDate : parseOptionalDate(input.endDate)
  if (startDate && endDate && startDate > endDate) {
    throw new Error("End date must be on or after the start date.")
  }

  const next: Group = { ...group, name, startDate, endDate }
  return { store: replaceGroup(store, next), group: next }
}

export function addMember(
  store: Store,
  groupId: string,
  rawName: string,
  actorProfileId: string
) {
  const group = requireGroup(store, groupId)
  if (!isTripAdmin(group, actorProfileId)) {
    throw new Error("Only a trip admin can add roster nicknames.")
  }
  requireSeated(group, actorProfileId)
  const name = cleanName(rawName, 40)
  if (!name) throw new Error("Member needs a name.")
  if (group.members.some((member) => member.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("That nickname is already on this trip.")
  }
  const next: Group = {
    ...group,
    members: [
      ...group.members,
      { id: uid("m"), name, profileId: null, coveredByMemberId: null },
    ],
  }
  return { store: replaceGroup(store, next), group: next }
}

export function setTripAdmin(
  store: Store,
  input: {
    groupId: string
    actorProfileId: string
    targetProfileId: string
    isAdmin: boolean
  }
) {
  const group = requireGroup(store, input.groupId)
  if (!isTripAdmin(group, input.actorProfileId)) {
    throw new Error("Only a trip admin can change admin access.")
  }
  requireSeated(group, input.actorProfileId)
  if (input.targetProfileId === group.createdByProfileId) {
    throw new Error("The trip creator always stays an admin.")
  }
  if (!group.members.some((member) => member.profileId === input.targetProfileId)) {
    throw new Error("Admin access requires a linked profile on this trip roster.")
  }
  const current = group.adminProfileIds ?? []
  const nextIds = input.isAdmin
    ? [...new Set([...current, input.targetProfileId])]
    : current.filter((id) => id !== input.targetProfileId)
  const next: Group = { ...group, adminProfileIds: nextIds }
  return { store: replaceGroup(store, next), group: next }
}

export function claimMember(
  store: Store,
  input: { groupId: string; memberId: string; profileId: string }
) {
  const profile = store.profiles.find((item) => item.id === input.profileId)
  if (!profile) throw new Error("Set up your profile first.")
  const group = requireGroup(store, input.groupId)
  const member = group.members.find((item) => item.id === input.memberId)
  if (!member) throw new Error("That seat is not on this trip.")
  if (member.profileId && member.profileId !== profile.id) {
    throw new Error("Someone already claimed that name.")
  }
  if (
    group.members.some(
      (item) => item.profileId === profile.id && item.id !== member.id
    )
  ) {
    throw new Error("You already claimed a name on this trip.")
  }

  const next: Group = {
    ...group,
    members: group.members.map((item) =>
      item.id === member.id ? { ...item, profileId: profile.id } : item
    ),
  }
  const withGroup = replaceGroup(store, next)
  const withContacts = syncTripContacts(withGroup, next.id)
  return { store: withContacts, group: next }
}

function requireDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date must be YYYY-MM-DD.")
  }
}

function parseOptionalDate(raw: string | null | undefined) {
  const date = (raw ?? "").trim()
  if (!date) return null
  requireDate(date)
  return date
}

function requireSeated(group: Group, profileId: string) {
  if (!group.members.some((member) => member.profileId === profileId)) {
    throw new Error("Claim your nickname on this trip first.")
  }
}

function canVoid(group: Group, profileId: string, authorId: string) {
  return authorId === profileId || group.createdByProfileId === profileId
}

export function addExpense(
  store: Store,
  input: {
    groupId: string
    date: string
    amount: number
    reason: string
    paidByMemberId: string
    participantIds: string[]
    split?: SplitMode
    shares?: Record<string, number>
    createdByProfileId: string
    expenseId?: string
  }
) {
  const profile = store.profiles.find((item) => item.id === input.createdByProfileId)
  if (!profile) throw new Error("Set up your profile first.")
  const group = requireGroup(store, input.groupId)
  requireSeated(group, profile.id)
  const fields = validateExpenseInput(group, input)
  const requestedId = (input.expenseId ?? "").trim()
  if (requestedId) {
    const existing = group.expenses.find((item) => item.id === requestedId)
    if (existing) return { store, group }
  }

  const expense: Expense = {
    id: requestedId || uid("e"),
    ...fields,
    createdByProfileId: profile.id,
    createdAt: nowIso(),
    voidedAt: null,
    voidedByProfileId: null,
  }
  let next: Group = { ...group, expenses: [expense, ...group.expenses] }
  next = appendLedgerDayOrder(next, expense.date, expense.id)
  return { store: replaceGroup(store, next), group: next }
}

function validateExpenseInput(
  group: Group,
  input: {
    date: string
    amount: number
    reason: string
    paidByMemberId: string
    participantIds: string[]
    split?: SplitMode
    shares?: Record<string, number>
  }
) {
  requireDate(input.date)
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Amount must be more than zero.")
  }
  const reason = cleanName(input.reason, 120)
  if (!reason) throw new Error("What was this for?")
  if (!group.members.some((member) => member.id === input.paidByMemberId)) {
    throw new Error("Payer is not on this trip.")
  }
  const participantIds = [...new Set(input.participantIds)]
  if (participantIds.length < 1) throw new Error("Pick at least one person on the bill.")
  if (participantIds.some((id) => !group.members.some((member) => member.id === id))) {
    throw new Error("A selected person is not on this trip.")
  }

  const split: SplitMode = input.split === "percent" ? "percent" : "equal"
  let shares: Record<string, number> = {}
  if (split === "percent") {
    shares = Object.fromEntries(
      participantIds.map((id) => [id, Math.round((Number(input.shares?.[id]) || 0) * 100) / 100])
    )
    if (!sharesComplete(participantIds, shares)) {
      throw new Error("Percents must be over zero and add to 100.")
    }
  }

  return {
    date: input.date,
    amount: Math.round(input.amount * 100) / 100,
    reason,
    paidByMemberId: input.paidByMemberId,
    participantIds,
    split,
    shares,
  }
}

export function updateExpense(
  store: Store,
  input: {
    groupId: string
    expenseId: string
    profileId: string
    date: string
    amount: number
    reason: string
    paidByMemberId: string
    participantIds: string[]
    split?: SplitMode
    shares?: Record<string, number>
  }
) {
  const profile = store.profiles.find((item) => item.id === input.profileId)
  if (!profile) throw new Error("Set up your profile first.")
  const group = requireGroup(store, input.groupId)
  requireSeated(group, profile.id)
  const expense = group.expenses.find((item) => item.id === input.expenseId)
  if (!expense) throw new Error("Expense not found.")
  if (!canVoid(group, input.profileId, expense.createdByProfileId)) {
    throw new Error("Only the author or trip opener can edit this spend.")
  }

  const fields = validateExpenseInput(group, input)
  let next: Group = {
    ...group,
    expenses: group.expenses.map((item) =>
      item.id === expense.id
        ? {
            ...item,
            ...fields,
          }
        : item
    ),
  }
  if (fields.date !== expense.date) {
    next = moveIdBetweenLedgerDays(next, expense.id, expense.date, fields.date)
  }
  return { store: replaceGroup(store, next), group: next }
}

export function deleteExpense(
  store: Store,
  input: { groupId: string; expenseId: string; profileId: string }
) {
  const group = requireGroup(store, input.groupId)
  const expense = group.expenses.find((item) => item.id === input.expenseId)
  if (!expense) throw new Error("Expense not found.")
  if (!canVoid(group, input.profileId, expense.createdByProfileId)) {
    throw new Error("Only the author or trip opener can delete this spend.")
  }
  let next: Group = {
    ...group,
    expenses: group.expenses.filter((item) => item.id !== expense.id),
  }
  next = removeIdFromLedgerDayOrder(next, expense.id)
  return { store: replaceGroup(store, next), group: next }
}

export function voidExpense(
  store: Store,
  input: { groupId: string; expenseId: string; profileId: string; restore?: boolean }
) {
  const group = requireGroup(store, input.groupId)
  const expense = group.expenses.find((item) => item.id === input.expenseId)
  if (!expense) throw new Error("Expense not found.")
  if (!canVoid(group, input.profileId, expense.createdByProfileId)) {
    throw new Error("Only the author or trip opener can cross this out.")
  }
  const next: Group = {
    ...group,
    expenses: group.expenses.map((item) =>
      item.id === expense.id
        ? {
            ...item,
            voidedAt: input.restore ? null : nowIso(),
            voidedByProfileId: input.restore ? null : input.profileId,
          }
        : item
    ),
  }
  return { store: replaceGroup(store, next), group: next }
}

export function addPayment(
  store: Store,
  input: {
    groupId: string
    date: string
    amount: number
    fromMemberId: string
    toMemberId: string
    createdByProfileId: string
    paymentId?: string
  }
) {
  const profile = store.profiles.find((item) => item.id === input.createdByProfileId)
  if (!profile) throw new Error("Set up your profile first.")
  const group = requireGroup(store, input.groupId)
  requireSeated(group, profile.id)
  requireDate(input.date)
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Amount must be more than zero.")
  }
  if (input.fromMemberId === input.toMemberId) {
    throw new Error("Paid-back needs two different people.")
  }
  if (!group.members.some((member) => member.id === input.fromMemberId)) {
    throw new Error("Payer is not on this trip.")
  }
  if (!group.members.some((member) => member.id === input.toMemberId)) {
    throw new Error("Receiver is not on this trip.")
  }
  const requestedId = (input.paymentId ?? "").trim()
  if (requestedId) {
    const existing = (group.payments ?? []).find((item) => item.id === requestedId)
    if (existing) return { store, group }
  }
  const payment: Payment = {
    id: requestedId || uid("pay"),
    date: input.date,
    amount: Math.round(input.amount * 100) / 100,
    fromMemberId: input.fromMemberId,
    toMemberId: input.toMemberId,
    createdByProfileId: profile.id,
    createdAt: nowIso(),
    voidedAt: null,
    voidedByProfileId: null,
  }
  let next: Group = { ...group, payments: [payment, ...(group.payments ?? [])] }
  next = appendLedgerDayOrder(next, payment.date, payment.id)
  return { store: replaceGroup(store, next), group: next }
}

export function reorderLedgerDay(
  store: Store,
  input: {
    groupId: string
    profileId: string
    date: string
    orderedIds: string[]
  }
) {
  const profile = store.profiles.find((item) => item.id === input.profileId)
  if (!profile) throw new Error("Set up your profile first.")
  const group = requireGroup(store, input.groupId)
  requireSeated(group, profile.id)
  requireDate(input.date)
  const day = ledgerDaysForViewer(group, null).find((item) => item.date === input.date)
  if (!day) throw new Error("No ledger rows for that date.")
  const expected = expectedLedgerDayIds(day)
  const ordered = [...new Set(input.orderedIds)]
  if (ordered.length !== expected.length) {
    throw new Error("Order must include every row for that day.")
  }
  const expectedSet = new Set(expected)
  if (!ordered.every((id) => expectedSet.has(id))) {
    throw new Error("Order includes unknown or duplicate rows.")
  }
  const next = setLedgerDayOrder(group, input.date, ordered)
  return { store: replaceGroup(store, next), group: next }
}

export function voidPayment(
  store: Store,
  input: { groupId: string; paymentId: string; profileId: string; restore?: boolean }
) {
  const group = requireGroup(store, input.groupId)
  const payment = (group.payments ?? []).find((item) => item.id === input.paymentId)
  if (!payment) throw new Error("Payment not found.")
  if (!canVoid(group, input.profileId, payment.createdByProfileId)) {
    throw new Error("Only the author or trip opener can cross this out.")
  }
  const next: Group = {
    ...group,
    payments: (group.payments ?? []).map((item) =>
      item.id === payment.id
        ? {
            ...item,
            voidedAt: input.restore ? null : nowIso(),
            voidedByProfileId: input.restore ? null : input.profileId,
          }
        : item
    ),
  }
  return { store: replaceGroup(store, next), group: next }
}

export function importTripCsv(
  store: Store,
  input: { groupId: string; profileId: string; csv: string }
) {
  const group = requireGroup(store, input.groupId)
  if (!isTripAdmin(group, input.profileId)) {
    throw new Error("Only a trip admin can import a CSV into this trip.")
  }
  requireSeated(group, input.profileId)
  const parsed = parseTripCsv(input.csv)
  const currency = parsed.trip.currency ?? group.currency
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency must be a 3-letter code.")
  }
  const startDate =
    parsed.trip.startDate === undefined ? group.startDate : parsed.trip.startDate
  const endDate = parsed.trip.endDate === undefined ? group.endDate : parsed.trip.endDate
  if (startDate && endDate && startDate > endDate) {
    throw new Error("End date must be on or after the start date.")
  }
  const name =
    parsed.trip.name === undefined ? group.name : cleanName(parsed.trip.name, 60)
  if (!name) throw new Error("Trip needs a name.")

  const next: Group = {
    ...group,
    name,
    currency,
    startDate,
    endDate,
    members: parsed.members,
    expenses: parsed.expenses,
    payments: parsed.payments,
    ledgerDayOrder: undefined,
  }
  return { store: replaceGroup(store, normalizeGroup(next)), group: normalizeGroup(next) }
}

export function setMemberCover(
  store: Store,
  input: {
    groupId: string
    memberId: string
    coveredByMemberId: string | null
    profileId: string
  }
) {
  const group = requireGroup(store, input.groupId)
  requireSeated(group, input.profileId)
  const member = group.members.find((item) => item.id === input.memberId)
  if (!member) throw new Error("Member not on this trip.")
  const coverId = input.coveredByMemberId
  if (coverId === null) {
    const next: Group = {
      ...group,
      members: group.members.map((item) =>
        item.id === member.id ? { ...item, coveredByMemberId: null } : item
      ),
    }
    return { store: replaceGroup(store, next), group: next }
  }
  if (coverId === member.id) throw new Error("A seat cannot cover itself.")
  if (!group.members.some((item) => item.id === coverId)) {
    throw new Error("Cover is not on this trip.")
  }
  let walk: string | null = coverId
  const seen = new Set<string>()
  while (walk) {
    if (walk === member.id) {
      throw new Error("That cover would create a loop.")
    }
    if (seen.has(walk)) break
    seen.add(walk)
    const nextMember = group.members.find((item) => item.id === walk)
    walk = nextMember?.coveredByMemberId ?? null
  }
  const next: Group = {
    ...group,
    members: group.members.map((item) =>
      item.id === member.id ? { ...item, coveredByMemberId: coverId } : item
    ),
  }
  return { store: replaceGroup(store, next), group: next }
}

export function groupsForProfile(store: Store, profileId: string) {
  return store.groups.filter((group) =>
    group.members.some((member) => member.profileId === profileId)
  )
}

export function groupByCode(store: Store, rawCode: string) {
  const code = rawCode.replace(/\s+/g, "").toUpperCase()
  return store.groups.find((group) => group.code === code) ?? null
}

export function suggestedMember(group: Group, profileName: string) {
  const needle = profileName.trim().toLowerCase()
  return (
    group.members.find(
      (member) => !member.profileId && member.name.toLowerCase() === needle
    ) ??
    group.members.find((member) => !member.profileId && member.name.toLowerCase().includes(needle)) ??
    null
  )
}

function joinRequests(store: Store): JoinRequest[] {
  return store.joinRequests ?? []
}

function tripInvites(store: Store): TripInvite[] {
  return store.tripInvites ?? []
}

function replaceStoreMeta(
  store: Store,
  meta: { tripInvites?: TripInvite[]; joinRequests?: JoinRequest[] }
): Store {
  return {
    ...store,
    tripInvites: meta.tripInvites ?? store.tripInvites ?? [],
    joinRequests: meta.joinRequests ?? store.joinRequests ?? [],
  }
}

export function sendTripInvite(
  store: Store,
  input: {
    groupId: string
    profileId: string
    email?: string | null
    phone?: string | null
    targetProfileId?: string | null
  }
) {
  const group = requireGroup(store, input.groupId)
  if (!isTripAdmin(group, input.profileId)) {
    throw new Error("Only the trip admin can send invites.")
  }
  requireSeated(group, input.profileId)
  let invitedEmail = normalizeInviteEmail(input.email)
  let invitedPhone = normalizeInvitePhone(input.phone)
  const targetId = input.targetProfileId?.trim()
  if (targetId) {
    const target = store.profiles.find((item) => item.id === targetId)
    if (target) {
      invitedEmail = invitedEmail ?? normalizeInviteEmail(target.email)
      invitedPhone = invitedPhone ?? normalizeInvitePhone(target.phone)
    }
  }
  if (!invitedEmail && !invitedPhone && input.email?.trim()) {
    const found = findProfileForContactSearch(store, input.email.trim())
    if (found) {
      invitedEmail = normalizeInviteEmail(found.email)
      invitedPhone = normalizeInvitePhone(found.phone)
    }
  }
  if (!invitedEmail && !invitedPhone && input.phone?.trim()) {
    const found = findProfileForContactSearch(store, input.phone.trim())
    if (found) {
      invitedEmail = normalizeInviteEmail(found.email)
      invitedPhone = normalizeInvitePhone(found.phone)
    }
  }
  if (!invitedEmail && !invitedPhone) {
    throw new Error("Enter an email, phone, or @username to invite.")
  }
  const invite: TripInvite = {
    id: uid("inv"),
    groupId: group.id,
    invitedEmail,
    invitedPhone,
    status: "pending",
    createdByProfileId: input.profileId,
    createdAt: nowIso(),
    respondedAt: null,
    respondedByProfileId: null,
  }
  let next = replaceStoreMeta(store, {
    tripInvites: [...tripInvites(store), invite],
  })
  const target =
    store.profiles.find((item) => profileMatchesInvite(item, invite)) ?? null
  if (target) {
    next = upsertContactInStore(next, {
      ownerProfileId: input.profileId,
      targetProfileId: target.id,
      source: "invite",
    })
  }
  return { store: next, group, invite }
}

export function addContact(
  store: Store,
  input: {
    ownerProfileId: string
    targetProfileId?: string
    query?: string
    source?: ContactSource
  }
) {
  const owner = store.profiles.find((item) => item.id === input.ownerProfileId)
  if (!owner) throw new Error("Set up your profile first.")
  let targetId = input.targetProfileId?.trim()
  if (!targetId && input.query) {
    const found = findProfileForContactSearch(store, input.query)
    if (!found) throw new Error("No profile matches that username, email, or phone.")
    targetId = found.id
  }
  if (!targetId) throw new Error("Choose someone to add.")
  const target = store.profiles.find((item) => item.id === targetId)
  if (!target) throw new Error("Profile not found.")
  const source = input.source ?? (input.query ? "search" : "search")
  const next = upsertContactInStore(store, {
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    source,
  })
  return {
    store: next,
    contacts: listContactsForProfile(next, owner.id),
  }
}

export function removeContact(
  store: Store,
  input: { ownerProfileId: string; targetProfileId: string }
) {
  const next = removeContactFromStore(
    store,
    input.ownerProfileId,
    input.targetProfileId
  )
  return {
    store: next,
    contacts: listContactsForProfile(next, input.ownerProfileId),
  }
}

export { findProfileForContactSearch, listContactsForProfile } from "@/lib/trip-contacts"

function upsertApprovedJoinRequest(
  store: Store,
  groupId: string,
  profileId: string
): Store {
  const existing = joinRequestForProfile(store, groupId, profileId)
  const list = joinRequests(store)
  if (existing?.status === "approved") return store
  const row: JoinRequest = existing
    ? { ...existing, status: "approved", decidedAt: nowIso(), decidedByProfileId: null }
    : {
        id: uid("jr"),
        groupId,
        profileId,
        status: "approved",
        createdAt: nowIso(),
        decidedAt: nowIso(),
        decidedByProfileId: null,
      }
  const nextList = existing
    ? list.map((item) => (item.id === existing.id ? row : item))
    : [...list, row]
  return replaceStoreMeta(store, { joinRequests: nextList })
}

export function acceptTripInvite(
  store: Store,
  input: { inviteId: string; profileId: string }
) {
  const profile = store.profiles.find((item) => item.id === input.profileId)
  if (!profile) throw new Error("Set up your profile first.")
  const invite = tripInvites(store).find((item) => item.id === input.inviteId)
  if (!invite) throw new Error("Invite not found.")
  if (invite.status !== "pending") throw new Error("That invite is no longer open.")
  if (!profileMatchesInvite(profile, invite)) {
    throw new Error("This invite is for a different email or phone.")
  }
  if (isGroupMember(input.profileId, requireGroup(store, invite.groupId))) {
    throw new Error("You are already on this trip.")
  }
  const updatedInvites = tripInvites(store).map((item) =>
    item.id === invite.id
      ? {
          ...item,
          status: "accepted" as const,
          respondedAt: nowIso(),
          respondedByProfileId: profile.id,
        }
      : item
  )
  let next = replaceStoreMeta(store, { tripInvites: updatedInvites })
  next = upsertApprovedJoinRequest(next, invite.groupId, profile.id)
  const group = requireGroup(next, invite.groupId)
  return { store: next, group, inviteId: invite.id }
}

export function declineTripInvite(
  store: Store,
  input: { inviteId: string; profileId: string }
) {
  const profile = store.profiles.find((item) => item.id === input.profileId)
  if (!profile) throw new Error("Set up your profile first.")
  const invite = tripInvites(store).find((item) => item.id === input.inviteId)
  if (!invite) throw new Error("Invite not found.")
  if (invite.status !== "pending") throw new Error("That invite is no longer open.")
  if (!profileMatchesInvite(profile, invite)) {
    throw new Error("This invite is for a different email or phone.")
  }
  const updatedInvites = tripInvites(store).map((item) =>
    item.id === invite.id
      ? {
          ...item,
          status: "declined" as const,
          respondedAt: nowIso(),
          respondedByProfileId: profile.id,
        }
      : item
  )
  const next = replaceStoreMeta(store, { tripInvites: updatedInvites })
  return { store: next }
}

export function revokeTripInvite(
  store: Store,
  input: { groupId: string; inviteId: string; profileId: string }
) {
  const group = requireGroup(store, input.groupId)
  if (!isTripAdmin(group, input.profileId)) {
    throw new Error("Only the trip admin can revoke invites.")
  }
  const invite = tripInvites(store).find((item) => item.id === input.inviteId)
  if (!invite || invite.groupId !== group.id) throw new Error("Invite not found.")
  const updatedInvites = tripInvites(store).map((item) =>
    item.id === invite.id
      ? { ...item, status: "revoked" as const, respondedAt: nowIso() }
      : item
  )
  const next = replaceStoreMeta(store, { tripInvites: updatedInvites })
  return { store: next, group: next.groups.find((g) => g.id === group.id)! }
}

export function requestJoin(
  store: Store,
  input: { groupId: string; profileId: string; code: string }
) {
  const profile = store.profiles.find((item) => item.id === input.profileId)
  if (!profile) throw new Error("Set up your profile first.")
  const group = requireGroup(store, input.groupId)
  if (normalizeJoinCode(input.code) !== normalizeJoinCode(group.code)) {
    throw new Error("Join code does not match this trip.")
  }
  if (isGroupMember(input.profileId, group)) {
    throw new Error("You are already on this trip.")
  }
  const existing = joinRequestForProfile(store, group.id, profile.id)
  if (existing?.status === "pending") {
    return { store, group, joinRequest: existing }
  }
  if (existing?.status === "approved") {
    return { store, group, joinRequest: existing }
  }
  const joinRequest: JoinRequest = {
    id: uid("jr"),
    groupId: group.id,
    profileId: profile.id,
    status: "pending",
    createdAt: nowIso(),
    decidedAt: null,
    decidedByProfileId: null,
  }
  const next = replaceStoreMeta(store, {
    joinRequests: [...joinRequests(store), joinRequest],
  })
  return { store: next, group, joinRequest }
}

function normalizeJoinCode(raw: string) {
  return raw.trim().toUpperCase()
}

export function approveJoinRequest(
  store: Store,
  input: { groupId: string; requestId: string; profileId: string }
) {
  const group = requireGroup(store, input.groupId)
  if (!isTripAdmin(group, input.profileId)) {
    throw new Error("Only the trip admin can approve join requests.")
  }
  const request = joinRequests(store).find((item) => item.id === input.requestId)
  if (!request || request.groupId !== group.id) throw new Error("Join request not found.")
  if (request.status !== "pending") throw new Error("That request was already decided.")
  const updated = joinRequests(store).map((item) =>
    item.id === request.id
      ? {
          ...item,
          status: "approved" as const,
          decidedAt: nowIso(),
          decidedByProfileId: input.profileId,
        }
      : item
  )
  const next = replaceStoreMeta(store, { joinRequests: updated })
  return { store: next, group: requireGroup(next, group.id) }
}

export function rejectJoinRequest(
  store: Store,
  input: { groupId: string; requestId: string; profileId: string }
) {
  const group = requireGroup(store, input.groupId)
  if (!isTripAdmin(group, input.profileId)) {
    throw new Error("Only the trip admin can reject join requests.")
  }
  const request = joinRequests(store).find((item) => item.id === input.requestId)
  if (!request || request.groupId !== group.id) throw new Error("Join request not found.")
  if (request.status !== "pending") throw new Error("That request was already decided.")
  const updated = joinRequests(store).map((item) =>
    item.id === request.id
      ? {
          ...item,
          status: "rejected" as const,
          decidedAt: nowIso(),
          decidedByProfileId: input.profileId,
        }
      : item
  )
  const next = replaceStoreMeta(store, { joinRequests: updated })
  return { store: next, group: requireGroup(next, group.id) }
}

export function claimMemberWithJoinApproval(
  store: Store,
  input: { groupId: string; memberId: string; profileId: string }
) {
  const group = requireGroup(store, input.groupId)
  if (group.joinApprovalRequired && !isGroupMember(input.profileId, group)) {
    const request = joinRequestForProfile(store, group.id, input.profileId)
    if (!request || request.status !== "approved") {
      throw new Error("Trip admin must approve your join request before you claim a seat.")
    }
  }
  return claimMember(store, input)
}
