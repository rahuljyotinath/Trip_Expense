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

export type Expense = {
  id: string
  date: string
  amount: number
  reason: string
  paidByMemberId: string
  participantIds: string[]
  createdByProfileId: string
  createdAt: string
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
