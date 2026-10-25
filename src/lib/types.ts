export type Profile = {
  id: string
  name: string
  createdAt: string
}

export type Member = {
  id: string
  name: string
  profileId: string | null
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

export function normalizeGroup(group: Group): Group {
  return {
    ...group,
    expenses: (group.expenses ?? []).map(normalizeExpense),
    payments: (group.payments ?? []).map(normalizePayment),
  }
}

export function normalizeStore(store: Store): Store {
  return {
    profiles: store.profiles ?? [],
    groups: (store.groups ?? []).map(normalizeGroup),
  }
}
