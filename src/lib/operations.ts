import { joinCode, nowIso, uid } from "@/lib/ids"
import type { Expense, Group, Profile, Store } from "@/lib/types"

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
    name,
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

  const group: Group = {
    id: uid("g"),
    name,
    code,
    currency,
    createdByProfileId: profile.id,
    createdAt: nowIso(),
    members: unique.map((memberName) => ({
      id: uid("m"),
      name: memberName,
      profileId:
        memberName.toLowerCase() === profile.name.toLowerCase() ? profile.id : null,
    })),
    expenses: [],
  }

  return {
    store: { ...store, groups: [group, ...store.groups] },
    group,
  }
}

export function addMember(store: Store, groupId: string, rawName: string) {
  const group = requireGroup(store, groupId)
  const name = cleanName(rawName, 40)
  if (!name) throw new Error("Member needs a name.")
  if (group.members.some((member) => member.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("That name is already on this trip.")
  }
  const next: Group = {
    ...group,
    members: [...group.members, { id: uid("m"), name, profileId: null }],
  }
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
  return { store: replaceGroup(store, next), group: next }
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
    createdByProfileId: string
  }
) {
  const profile = store.profiles.find((item) => item.id === input.createdByProfileId)
  if (!profile) throw new Error("Set up your profile first.")
  const group = requireGroup(store, input.groupId)
  if (!group.members.some((member) => member.profileId === profile.id)) {
    throw new Error("Claim your name on this trip before adding spends.")
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("Date must be YYYY-MM-DD.")
  }
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

  const expense: Expense = {
    id: uid("e"),
    date: input.date,
    amount: Math.round(input.amount * 100) / 100,
    reason,
    paidByMemberId: input.paidByMemberId,
    participantIds,
    createdByProfileId: profile.id,
    createdAt: nowIso(),
  }
  const next: Group = { ...group, expenses: [expense, ...group.expenses] }
  return { store: replaceGroup(store, next), group: next }
}

export function deleteExpense(
  store: Store,
  input: { groupId: string; expenseId: string; profileId: string }
) {
  const group = requireGroup(store, input.groupId)
  const expense = group.expenses.find((item) => item.id === input.expenseId)
  if (!expense) throw new Error("Expense not found.")
  if (
    expense.createdByProfileId !== input.profileId &&
    group.createdByProfileId !== input.profileId
  ) {
    throw new Error("Only the author or trip opener can remove this.")
  }
  const next: Group = {
    ...group,
    expenses: group.expenses.filter((item) => item.id !== expense.id),
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
