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

/** Public card for someone else — no email or phone. */
export type PublicProfileView = Pick<
  PublicProfile,
  "id" | "username" | "name" | "createdAt"
>

export type LinkedTripProfile = PublicProfileView & {
  profileId: string
}

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

export type TripInviteStatus = "pending" | "accepted" | "declined" | "revoked"

export type TripInvite = {
  id: string
  groupId: string
  invitedEmail: string | null
  invitedPhone: string | null
  status: TripInviteStatus
  createdByProfileId: string
  createdAt: string
  respondedAt: string | null
  respondedByProfileId: string | null
}

export type JoinRequestStatus = "pending" | "approved" | "rejected"

export type ContactSource = "search" | "trip" | "invite"

export type Contact = {
  id: string
  ownerProfileId: string
  targetProfileId: string
  source: ContactSource
  createdAt: string
}

export type JoinRequest = {
  id: string
  groupId: string
  profileId: string
  status: JoinRequestStatus
  createdAt: string
  decidedAt: string | null
  decidedByProfileId: string | null
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
  /** Custom row order within a calendar date (expense + payment ids). */
  ledgerDayOrder?: Record<string, string[]>
  /** When true, code join creates a pending request until admin approves. */
  joinApprovalRequired?: boolean
  /** Delegated trip admins (profile ids). Creator is always admin via createdByProfileId. */
  adminProfileIds?: string[]
}

export type Store = {
  profiles: Profile[]
  groups: Group[]
  tripInvites?: TripInvite[]
  joinRequests?: JoinRequest[]
  contacts?: Contact[]
}

export type StorageMode = "postgres" | "local" | "unconfigured"

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

export function publicProfileView(profile: Profile): PublicProfileView {
  const normalized = normalizeProfile(profile)
  return {
    id: normalized.id,
    username: normalized.username,
    name: normalized.name,
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
    ledgerDayOrder: group.ledgerDayOrder ?? undefined,
    joinApprovalRequired: group.joinApprovalRequired ?? false,
    adminProfileIds: [...new Set(group.adminProfileIds ?? [])].filter(
      (id) => id && id !== group.createdByProfileId
    ),
  }
}

function normalizeTripInvite(invite: TripInvite): TripInvite {
  return {
    ...invite,
    invitedEmail: invite.invitedEmail ?? null,
    invitedPhone: invite.invitedPhone ?? null,
    status: invite.status ?? "pending",
    respondedAt: invite.respondedAt ?? null,
    respondedByProfileId: invite.respondedByProfileId ?? null,
  }
}

function normalizeContact(contact: Contact): Contact {
  return {
    ...contact,
    source:
      contact.source === "trip" || contact.source === "invite"
        ? contact.source
        : "search",
  }
}

function normalizeJoinRequest(request: JoinRequest): JoinRequest {
  return {
    ...request,
    status: request.status ?? "pending",
    decidedAt: request.decidedAt ?? null,
    decidedByProfileId: request.decidedByProfileId ?? null,
  }
}

export function normalizeStore(store: Store): Store {
  return {
    profiles: (store.profiles ?? []).map(normalizeProfile),
    groups: (store.groups ?? []).map(normalizeGroup),
    tripInvites: (store.tripInvites ?? []).map(normalizeTripInvite),
    joinRequests: (store.joinRequests ?? []).map(normalizeJoinRequest),
    contacts: (store.contacts ?? []).map(normalizeContact),
  }
}
