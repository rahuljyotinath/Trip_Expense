export type Profile = {
  id: string
  username: string
  passwordHash: string
  name: string
  email: string | null
  phone: string | null
  createdAt: string
}

export type PublicProfile = Omit<Profile, "passwordHash">

export type Member = {
  id: string
  name: string
  profileId: string | null
  coveredByMemberId: string | null
}

export type SplitMode = "equal" | "percent"

export type Expense = {
  id: string
  date: string
  amount: number
  reason: string
  paidByMemberId: string
  participantIds: string[]
  split: SplitMode
  shares: Record<string, number>
  createdByProfileId: string
  createdAt: string
  voidedAt: string | null
  voidedByProfileId: string | null
}

export type Payment = {
  id: string
  date: string
  amount: number
  fromMemberId: string
  toMemberId: string
  createdByProfileId: string
  createdAt: string
  voidedAt: string | null
  voidedByProfileId: string | null
}

export type Group = {
  id: string
  name: string
  code: string
  currency: string
  startDate: string | null
  endDate: string | null
  createdByProfileId: string
  createdAt: string
  members: Member[]
  expenses: Expense[]
  payments: Payment[]
}

export type Store = {
  profiles: Profile[]
  groups: Group[]
}

export type StorageMode = "github" | "local" | "unconfigured"

export type Transfer = {
  fromMemberId: string
  toMemberId: string
  amount: number
}

export function emptyStore(): Store {
  return { profiles: [], groups: [] }
}

export function normalizeExpense(expense: Expense): Expense {
  return {
    ...expense,
    split: expense.split === "percent" ? "percent" : "equal",
    shares: expense.shares ?? {},
    voidedAt: expense.voidedAt ?? null,
    voidedByProfileId: expense.voidedByProfileId ?? null,
  }
}

export function normalizePayment(payment: Payment): Payment {
  return {
    ...payment,
    voidedAt: payment.voidedAt ?? null,
    voidedByProfileId: payment.voidedByProfileId ?? null,
  }
}

export function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    username: profile.username ?? "",
    passwordHash: profile.passwordHash ?? "",
    email: profile.email ?? null,
    phone: profile.phone ?? null,
  }
}

export function publicProfile(profile: Profile): PublicProfile {
  const normalized = normalizeProfile(profile)
  return {
    id: normalized.id,
    username: normalized.username,
    name: normalized.name,
    email: normalized.email,
    phone: normalized.phone,
    createdAt: normalized.createdAt,
  }
}

export function normalizeMember(member: Member): Member {
  return {
    ...member,
    profileId: member.profileId ?? null,
    coveredByMemberId: member.coveredByMemberId ?? null,
  }
}

export function normalizeGroup(group: Group): Group {
  return {
    ...group,
    startDate: group.startDate ?? null,
    endDate: group.endDate ?? null,
    members: (group.members ?? []).map(normalizeMember),
    expenses: (group.expenses ?? []).map(normalizeExpense),
    payments: (group.payments ?? []).map(normalizePayment),
  }
}

export function normalizeStore(store: Store): Store {
  return {
    profiles: (store.profiles ?? []).map(normalizeProfile),
    groups: (store.groups ?? []).map(normalizeGroup),
  }
}
