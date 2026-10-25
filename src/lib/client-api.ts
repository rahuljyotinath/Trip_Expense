import {
  emptyStore,
  normalizeStore,
  type Group,
  type Profile,
  type SplitMode,
  type StorageMode,
  type Store,
} from "@/lib/types"
import {
  addExpense,
  addMember,
  addPayment,
  claimMember,
  createGroup,
  createProfile,
  groupByCode,
  groupsForProfile,
  voidExpense,
  voidPayment,
} from "@/lib/operations"

const PROFILE_KEY = "waybill.profile"
const LOCAL_STORE_KEY = "waybill.store"

export type Health = {
  mode: StorageMode
  warning: string | null
  repo: string | null
}

let mode: StorageMode = "local"

function readLocalStore(): Store {
  if (typeof window === "undefined") return emptyStore()
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<Store>
    return normalizeStore({
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    })
  } catch {
    return emptyStore()
  }
}

function writeLocalStore(store: Store) {
  window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(store))
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (response.status === 503 || data.error === "unconfigured") {
    mode = "unconfigured"
    throw new Error("unconfigured")
  }
  if (!response.ok) {
    throw new Error(data.error || "Request failed.")
  }
  return data
}

export function loadSavedProfile() {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

export function saveProfile(profile: Profile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function clearSavedProfile() {
  window.localStorage.removeItem(PROFILE_KEY)
}

export async function loadHealth(): Promise<Health> {
  try {
    const health = await request<Health>("/api/health")
    mode = health.mode
    return health
  } catch {
    mode = "unconfigured"
    return {
      mode: "unconfigured",
      warning: "Using this browser only until GitHub file storage is configured.",
      repo: null,
    }
  }
}

export async function fetchProfile(id: string) {
  if (mode === "unconfigured") {
    const profile = readLocalStore().profiles.find((item) => item.id === id)
    if (!profile) throw new Error("Profile not found.")
    return profile
  }
  const data = await request<{ profile: Profile }>(`/api/profiles?id=${encodeURIComponent(id)}`)
  return data.profile
}

export async function createUserProfile(name: string) {
  if (mode === "unconfigured") {
    const result = createProfile(readLocalStore(), name)
    writeLocalStore(result.store)
    saveProfile(result.profile)
    return result.profile
  }
  const data = await request<{ profile: Profile }>("/api/profiles", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
  saveProfile(data.profile)
  return data.profile
}

export async function fetchMyGroups(profileId: string) {
  if (mode === "unconfigured") {
    return groupsForProfile(readLocalStore(), profileId)
  }
  const data = await request<{ groups: Group[] }>(
    `/api/groups?profileId=${encodeURIComponent(profileId)}`
  )
  return data.groups
}

export async function fetchGroupByCode(code: string) {
  if (mode === "unconfigured") {
    const group = groupByCode(readLocalStore(), code)
    if (!group) throw new Error("No trip uses that code.")
    return group
  }
  const data = await request<{ group: Group }>(`/api/groups?code=${encodeURIComponent(code)}`)
  return data.group
}

export async function fetchGroup(id: string) {
  if (mode === "unconfigured") {
    const group = readLocalStore().groups.find((item) => item.id === id)
    if (!group) throw new Error("Trip not found.")
    return group
  }
  const data = await request<{ group: Group }>(`/api/groups/${id}`)
  return data.group
}

export async function openTrip(input: {
  name: string
  memberNames: string[]
  createdByProfileId: string
  currency?: string
}) {
  if (mode === "unconfigured") {
    const result = createGroup(readLocalStore(), input)
    writeLocalStore(result.store)
    return result.group
  }
  const data = await request<{ group: Group }>("/api/groups", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return data.group
}

async function patchGroup(id: string, body: Record<string, unknown>) {
  if (mode === "unconfigured") {
    const store = readLocalStore()
    const action = body.action
    const result =
      action === "claim"
        ? claimMember(store, {
            groupId: id,
            memberId: String(body.memberId ?? ""),
            profileId: String(body.profileId ?? ""),
          })
        : action === "add-member"
          ? addMember(store, id, String(body.name ?? ""))
          : action === "add-expense"
            ? addExpense(store, {
                groupId: id,
                date: String(body.date ?? ""),
                amount: Number(body.amount),
                reason: String(body.reason ?? ""),
                paidByMemberId: String(body.paidByMemberId ?? ""),
                participantIds: (body.participantIds as string[]) ?? [],
                split: body.split as SplitMode | undefined,
                shares: (body.shares as Record<string, number>) ?? {},
                createdByProfileId: String(body.profileId ?? ""),
              })
            : action === "void-expense" || action === "delete-expense"
              ? voidExpense(store, {
                  groupId: id,
                  expenseId: String(body.expenseId ?? ""),
                  profileId: String(body.profileId ?? ""),
                  restore: Boolean(body.restore),
                })
              : action === "add-payment"
                ? addPayment(store, {
                    groupId: id,
                    date: String(body.date ?? ""),
                    amount: Number(body.amount),
                    fromMemberId: String(body.fromMemberId ?? ""),
                    toMemberId: String(body.toMemberId ?? ""),
                    createdByProfileId: String(body.profileId ?? ""),
                  })
                : action === "void-payment"
                  ? voidPayment(store, {
                      groupId: id,
                      paymentId: String(body.paymentId ?? ""),
                      profileId: String(body.profileId ?? ""),
                      restore: Boolean(body.restore),
                    })
                  : null
    if (!result) throw new Error("Unknown action.")
    writeLocalStore(result.store)
    return result.group
  }
  const data = await request<{ group: Group }>(`/api/groups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
  return data.group
}

export function claimSeat(groupId: string, memberId: string, profileId: string) {
  return patchGroup(groupId, { action: "claim", memberId, profileId })
}

export function inviteName(groupId: string, name: string) {
  return patchGroup(groupId, { action: "add-member", name })
}

export function saveExpense(
  groupId: string,
  input: {
    date: string
    amount: number
    reason: string
    paidByMemberId: string
    participantIds: string[]
    split: SplitMode
    shares: Record<string, number>
    profileId: string
  }
) {
  return patchGroup(groupId, { action: "add-expense", ...input })
}

export function crossExpense(
  groupId: string,
  expenseId: string,
  profileId: string,
  restore = false
) {
  return patchGroup(groupId, { action: "void-expense", expenseId, profileId, restore })
}

export function recordPayment(
  groupId: string,
  input: {
    date: string
    amount: number
    fromMemberId: string
    toMemberId: string
    profileId: string
  }
) {
  return patchGroup(groupId, { action: "add-payment", ...input })
}

export function crossPayment(
  groupId: string,
  paymentId: string,
  profileId: string,
  restore = false
) {
  return patchGroup(groupId, { action: "void-payment", paymentId, profileId, restore })
}
