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
import { logIn, signUp, updateProfile } from "@/lib/auth-ops"
import {
  addExpense,
  addMember,
  addPayment,
  claimMember,
  importTripCsv,
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
import {
  ensureProfileForPatch,
  preparePatchStore,
  resolvePatchActor,
  storeWithTrip,
  upsertProfileInStore,
} from "@/lib/store-session"

const PROFILE_KEY = "waybill.profile"
const LOCAL_STORE_KEY = "waybill.store"

export type Health = {
  mode: StorageMode
  warning: string | null
  /** Transient reachability failure (not a storage config issue). */
  notice?: string | null
  repo: string | null
  connected: boolean
  githubUrl: string | null
  branch?: string | null
  filePath?: string | null
  error?: string | null
}

const HEALTH_CACHE_MS = 45_000

let mode: StorageMode = "local"
let healthCache: { health: Health; at: number } | null = null
let healthInFlight: Promise<Health> | null = null

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

const REQUEST_TIMEOUT_MS = 25_000

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const parentSignal = init?.signal
  const onParentAbort = () => controller.abort()
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort()
    else parentSignal.addEventListener("abort", onParentAbort, { once: true })
  }
  try {
    const response = await fetch(url, {
      credentials: "include",
      ...init,
      signal: controller.signal,
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
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.")
    }
    throw error
  } finally {
    clearTimeout(timeout)
    if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort)
  }
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

export function syncProfileToLocalStore(profile: PublicProfile) {
  if (typeof window === "undefined") return
  writeLocalStore(upsertProfileInStore(readLocalStore(), profile))
}

export function saveProfile(profile: PublicProfile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  syncProfileToLocalStore(profile)
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

export async function updateProfileUser(input: {
  name?: string
  email?: string | null
  phone?: string | null
}) {
  const saved = loadSavedProfile()
  if (mode === "unconfigured") {
    if (!saved?.id) throw new Error("Sign in again.")
    const result = updateProfile(readLocalStore(), {
      profileId: saved.id,
      ...input,
    })
    writeLocalStore(result.store)
    const pub = publicProfile(result.profile)
    saveProfile(pub)
    return pub
  }
  const data = await request<{ profile: PublicProfile }>("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
  saveProfile(data.profile)
  return data.profile
}

export async function logoutUser() {
  clearSavedProfile()
  if (typeof window !== "undefined") {
    writeLocalStore(emptyStore())
  }
  if (mode !== "unconfigured") {
    try {
      await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" })
    } catch {
      /* ignore */
    }
  }
}

function healthReachabilityNotice(): Health {
  const cached = healthCache?.health
  const notice =
    "Could not reach the server ledger (timed out). Retry or check connection."
  if (cached) {
    mode = cached.mode
    return {
      ...cached,
      connected: false,
      warning: null,
      notice,
      error: "Health check failed.",
    }
  }
  mode = "unconfigured"
  return {
    mode: "unconfigured",
    warning: null,
    notice,
    repo: "rahuljyotinath/Trip_Expense",
    connected: false,
    githubUrl: "https://github.com/rahuljyotinath/Trip_Expense",
    error: "Health check failed.",
  }
}

async function requestHealthFromServer(allowRetry: boolean): Promise<Health> {
  try {
    const health = await request<Health>("/api/health")
    mode = health.mode
    healthCache = { health: { ...health, notice: null }, at: Date.now() }
    return healthCache.health
  } catch (error) {
    if (allowRetry) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      return requestHealthFromServer(false)
    }
    throw error
  }
}

export async function loadHealth(options?: { force?: boolean }): Promise<Health> {
  if (
    !options?.force &&
    healthCache &&
    Date.now() - healthCache.at < HEALTH_CACHE_MS
  ) {
    mode = healthCache.health.mode
    return healthCache.health
  }
  if (healthInFlight && !options?.force) {
    return healthInFlight
  }
  const run = (async () => {
    try {
      return await requestHealthFromServer(true)
    } catch {
      return healthReachabilityNotice()
    } finally {
      healthInFlight = null
    }
  })()
  healthInFlight = run
  return run
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

async function requestGroupById(id: string, allowRetry: boolean): Promise<Group> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`/api/groups/${id}`, {
      credentials: "include",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    })
    const data = (await response.json().catch(() => ({}))) as {
      group?: Group
      error?: string
    }
    if (response.status === 503 || data.error === "unconfigured") {
      mode = "unconfigured"
      throw new Error("unconfigured")
    }
    if (response.status === 404 && data.error === "Trip not found." && allowRetry) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      return requestGroupById(id, false)
    }
    if (!response.ok) {
      throw new Error(data.error || "Request failed.")
    }
    if (!data.group) throw new Error("Trip not found.")
    return data.group
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.")
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchGroup(id: string, options?: { skipHealth?: boolean }) {
  await ensureClientMode(options)
  if (mode === "unconfigured") {
    const group = readLocalStore().groups.find((item) => item.id === id)
    if (!group) throw new Error("Trip not found.")
    return group
  }
  return requestGroupById(id, true)
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

function resolvePatchProfileId(body: Record<string, unknown>, fallbackId: string) {
  const raw = String(body.profileId ?? "").trim()
  return raw || fallbackId
}

function runGroupPatchMutator(
  store: Store,
  id: string,
  body: Record<string, unknown>,
  actorProfileId = ""
): GroupPatchResult | null {
  const profileId = resolvePatchProfileId(body, actorProfileId)
  const action = body.action
  if (action === "claim") {
    return claimMember(store, {
      groupId: id,
      memberId: String(body.memberId ?? ""),
      profileId,
    })
  }
  if (action === "add-member") {
    return addMember(store, id, String(body.name ?? ""))
  }
  if (action === "update-group") {
    return updateGroup(store, {
      groupId: id,
      profileId,
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
      createdByProfileId: profileId,
    })
  }
  if (action === "delete-expense") {
    return deleteExpense(store, {
      groupId: id,
      expenseId: String(body.expenseId ?? ""),
      profileId,
    })
  }
  if (action === "update-expense") {
    return updateExpense(store, {
      groupId: id,
      expenseId: String(body.expenseId ?? ""),
      profileId,
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
      profileId,
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
      createdByProfileId: profileId,
    })
  }
  if (action === "void-payment") {
    return voidPayment(store, {
      groupId: id,
      paymentId: String(body.paymentId ?? ""),
      profileId,
      restore: Boolean(body.restore),
    })
  }
  if (action === "import-trip-csv") {
    return importTripCsv(store, {
      groupId: id,
      profileId,
      csv: String(body.csv ?? ""),
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
      profileId,
    })
  }
  return null
}

/** Apply a PATCH body to the current trip in memory (no network). */
export function previewGroupPatch(
  group: Group,
  body: Record<string, unknown>,
  actor?: PublicProfile | null
): Group {
  const session = resolvePatchActor(actor, loadSavedProfile())
  if (!session?.id) throw new Error("Sign in again.")
  if (actor) syncProfileToLocalStore(actor)
  const profileId = resolvePatchProfileId(body, session.id)
  let store = preparePatchStore(readLocalStore(), group, session)
  store = ensureProfileForPatch(store, group, profileId)
  const result = runGroupPatchMutator(store, group.id, body, session.id)
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
  },
  actor?: PublicProfile | null
): void {
  let preview: Group
  try {
    preview = previewGroupPatch(group, body, actor)
  } catch (error) {
    handlers.onError(error instanceof Error ? error.message : "Update failed.")
    return
  }
  handlers.onApplied(preview)

  void (async () => {
    try {
      const server = await patchGroup(group.id, body, group)
      handlers.onReconciled?.(server)
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Could not save."
      const message = raw.startsWith("Could not save") ? raw : `Could not save: ${raw}`
      handlers.onError(message)
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

async function ensureClientMode(options?: { skipHealth?: boolean }) {
  if (typeof window === "undefined") return
  if (options?.skipHealth) return
  if (healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS) return
  if (mode !== "local") return
  await loadHealth()
}

async function patchGroup(id: string, body: Record<string, unknown>, groupHint?: Group) {
  await ensureClientMode()
  if (!id.trim()) throw new Error("Trip not found.")
  if (mode === "unconfigured") {
    const saved = loadSavedProfile()
    if (!saved?.id) throw new Error("Sign in again.")
    const group =
      groupHint ?? readLocalStore().groups.find((item) => item.id === id) ?? null
    if (!group) throw new Error("Trip not found.")
    const profileId = resolvePatchProfileId(body, saved.id)
    let store = preparePatchStore(readLocalStore(), group, saved)
    store = ensureProfileForPatch(store, group, profileId)
    const result = runGroupPatchMutator(store, id, body, saved.id)
    if (!result) throw new Error("Unknown action.")
    writeLocalStore(result.store)
    return result.group
  }
  const data = await request<{ group: Group }>(`/api/groups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
  writeLocalStore(storeWithTrip(readLocalStore(), data.group))
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
