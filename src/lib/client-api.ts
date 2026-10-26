import {
  emptyStore,
  normalizeStore,
  publicProfile,
  type Group,
  type PublicProfile,
  type SplitMode,
  type StorageMode,
  type Store,
} from "@/lib/types"
import { logIn, signUp } from "@/lib/auth-ops"
import {
  addExpense,
  addMember,
  addPayment,
  claimMember,
  setMemberCover,
  createGroup,
  deleteExpense,
  groupByCode,
  groupsForProfile,
  updateExpense,
  updateGroup,
  voidExpense,
  voidPayment,
} from "@/lib/operations"

const PROFILE_KEY = "waybill.profile"
const LOCAL_STORE_KEY = "waybill.store"

export type Health = {
  mode: StorageMode
  warning: string | null
  repo: string | null
  connected: boolean
  githubUrl: string | null
  branch?: string | null
  filePath?: string | null
  error?: string | null
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
    credentials: "include",
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

export function loadSavedProfile(): PublicProfile | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as PublicProfile) : null
  } catch {
    return null
  }
}

export function saveProfile(profile: PublicProfile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function clearSavedProfile() {
  window.localStorage.removeItem(PROFILE_KEY)
}

export async function fetchSessionProfile() {
  if (mode === "unconfigured") {
    return loadSavedProfile()
  }
  try {
    const data = await request<{ profile: PublicProfile | null }>("/api/auth/session")
    if (data.profile) saveProfile(data.profile)
    return data.profile
  } catch {
    return null
  }
}

export async function signUpUser(input: {
  username: string
  password: string
  name?: string
}) {
  if (mode === "unconfigured") {
    const result = signUp(readLocalStore(), input)
    writeLocalStore(result.store)
    const pub = publicProfile(result.profile)
    saveProfile(pub)
    return pub
  }
  const data = await request<{ profile: PublicProfile }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  })
  saveProfile(data.profile)
  return data.profile
}

export async function logInUser(input: { username: string; password: string }) {
  if (mode === "unconfigured") {
    const result = logIn(readLocalStore(), input)
    const pub = publicProfile(result.profile)
    saveProfile(pub)
    return pub
  }
  const data = await request<{ profile: PublicProfile }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  })
  saveProfile(data.profile)
  return data.profile
}

export async function logoutUser() {
  clearSavedProfile()
  if (mode !== "unconfigured") {
    try {
      await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" })
    } catch {
      /* ignore */
    }
  }
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
      repo: "rahuljyotinath/Trip_Expense",
      connected: false,
      githubUrl: "https://github.com/rahuljyotinath/Trip_Expense",
      error: "Health check failed.",
    }
  }
}

export async function fetchProfile(id: string) {
  if (mode === "unconfigured") {
    const profile = readLocalStore().profiles.find((item) => item.id === id)
    if (!profile) throw new Error("Profile not found.")
    return publicProfile(profile)
  }
  const data = await request<{ profile: PublicProfile }>(
    `/api/profiles?id=${encodeURIComponent(id)}`
  )
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
  startDate?: string | null
  endDate?: string | null
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

type GroupPatchResult = { store: Store; group: Group }

function storeWithGroup(store: Store, group: Group): Store {
  const has = store.groups.some((item) => item.id === group.id)
  return {
    ...store,
    groups: has
      ? store.groups.map((item) => (item.id === group.id ? group : item))
      : [group, ...store.groups],
  }
}

function runGroupPatchMutator(
  store: Store,
  id: string,
  body: Record<string, unknown>
): GroupPatchResult | null {
  const action = body.action
  if (action === "claim") {
    return claimMember(store, {
      groupId: id,
      memberId: String(body.memberId ?? ""),
      profileId: String(body.profileId ?? ""),
    })
  }
  if (action === "add-member") {
    return addMember(store, id, String(body.name ?? ""))
  }
  if (action === "update-group") {
    return updateGroup(store, {
      groupId: id,
      profileId: String(body.profileId ?? ""),
      name: body.name !== undefined ? String(body.name) : undefined,
      startDate:
        body.startDate === undefined
          ? undefined
          : body.startDate === null
            ? null
            : String(body.startDate),
      endDate:
        body.endDate === undefined
          ? undefined
          : body.endDate === null
            ? null
            : String(body.endDate),
    })
  }
  if (action === "add-expense") {
    return addExpense(store, {
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
  }
  if (action === "delete-expense") {
    return deleteExpense(store, {
      groupId: id,
      expenseId: String(body.expenseId ?? ""),
      profileId: String(body.profileId ?? ""),
    })
  }
  if (action === "update-expense") {
    return updateExpense(store, {
      groupId: id,
      expenseId: String(body.expenseId ?? ""),
      profileId: String(body.profileId ?? ""),
      date: String(body.date ?? ""),
      amount: Number(body.amount),
      reason: String(body.reason ?? ""),
      paidByMemberId: String(body.paidByMemberId ?? ""),
      participantIds: (body.participantIds as string[]) ?? [],
      split: body.split as SplitMode | undefined,
      shares: (body.shares as Record<string, number>) ?? {},
    })
  }
  if (action === "void-expense") {
    return voidExpense(store, {
      groupId: id,
      expenseId: String(body.expenseId ?? ""),
      profileId: String(body.profileId ?? ""),
      restore: Boolean(body.restore),
    })
  }
  if (action === "add-payment") {
    return addPayment(store, {
      groupId: id,
      date: String(body.date ?? ""),
      amount: Number(body.amount),
      fromMemberId: String(body.fromMemberId ?? ""),
      toMemberId: String(body.toMemberId ?? ""),
      createdByProfileId: String(body.profileId ?? ""),
    })
  }
  if (action === "void-payment") {
    return voidPayment(store, {
      groupId: id,
      paymentId: String(body.paymentId ?? ""),
      profileId: String(body.profileId ?? ""),
      restore: Boolean(body.restore),
    })
  }
  if (action === "cover-member") {
    const rawCover = body.coveredByMemberId
    return setMemberCover(store, {
      groupId: id,
      memberId: String(body.memberId ?? ""),
      coveredByMemberId:
        rawCover === null || rawCover === undefined || rawCover === ""
          ? null
          : String(rawCover),
      profileId: String(body.profileId ?? ""),
    })
  }
  return null
}

/** Apply a PATCH body to the current trip in memory (no network). */
export function previewGroupPatch(group: Group, body: Record<string, unknown>): Group {
  const store = storeWithGroup(readLocalStore(), group)
  const result = runGroupPatchMutator(store, group.id, body)
  if (!result) throw new Error("Unknown action.")
  return result.group
}

/** Update UI immediately, persist in the background, reconcile or rollback on failure. */
export function commitGroupPatch(
  group: Group,
  body: Record<string, unknown>,
  handlers: {
    onApplied: (next: Group) => void
    onError: (message: string) => void
    onReconciled?: (next: Group) => void
    fetchLatest?: () => Promise<Group>
  }
): void {
  let preview: Group
  try {
    preview = previewGroupPatch(group, body)
  } catch (error) {
    handlers.onError(error instanceof Error ? error.message : "Update failed.")
    return
  }
  handlers.onApplied(preview)

  void (async () => {
    try {
      const server = await patchGroup(group.id, body)
      handlers.onReconciled?.(server)
    } catch (error) {
      handlers.onError(error instanceof Error ? error.message : "Could not save.")
      if (handlers.fetchLatest) {
        try {
          handlers.onReconciled?.(await handlers.fetchLatest())
        } catch {
          /* keep last applied state */
        }
      }
    }
  })()
}

async function patchGroup(id: string, body: Record<string, unknown>) {
  if (mode === "unconfigured") {
    const store = readLocalStore()
    const result = runGroupPatchMutator(store, id, body)
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

export function updateTripDetails(
  groupId: string,
  input: {
    profileId: string
    name?: string
    startDate?: string | null
    endDate?: string | null
  }
) {
  return patchGroup(groupId, { action: "update-group", ...input })
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

export function patchExpense(
  groupId: string,
  input: {
    expenseId: string
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
  return patchGroup(groupId, { action: "update-expense", ...input })
}

export function removeExpense(groupId: string, expenseId: string, profileId: string) {
  return patchGroup(groupId, { action: "delete-expense", expenseId, profileId })
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
