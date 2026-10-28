import {
  emptyStore,
  normalizeStore,
  publicProfile,
  type Group,
  type JoinRequest,
  type PublicProfile,
  type PublicProfileView,
  type LinkedTripProfile,
  type TripInvite,
  type SplitMode,
  type StorageMode,
  type Store,
} from "@/lib/types"
import { logIn, signUp, updateProfile } from "@/lib/auth-ops"
import {
  addExpense,
  addMember,
  addPayment,
  claimMemberWithJoinApproval,
  approveJoinRequest,
  rejectJoinRequest,
  requestJoin,
  revokeTripInvite,
  sendTripInvite,
  setTripAdmin,
  importTripCsv,
  setMemberCover,
  createGroup,
  deleteExpense,
  groupByCode,
  groupsForProfile,
  updateExpense,
  updateGroup,
  reorderLedgerDay,
  voidExpense,
  voidPayment,
} from "@/lib/operations"
import { linkedProfilesForGroup } from "@/lib/linked-trip-profiles"
import {
  joinRequestForProfile,
  pendingInvitesForProfile,
} from "@/lib/trip-invites"
import { findProfileForContactSearch } from "@/lib/trip-contacts"
import { publicProfileView } from "@/lib/types"
import { nowIso } from "@/lib/ids"
import {
  browserOutbox,
  isNetworkError,
  isRetryableSyncError,
  withClientPatchIds,
  type OutboxOp,
} from "@/lib/offline-outbox"
import {
  ensureProfileForPatch,
  preparePatchStore,
  resolvePatchActor,
  storeWithTrip,
  upsertProfileInStore,
} from "@/lib/store-session"

export { isNetworkError, isRetryableSyncError } from "@/lib/offline-outbox"

const JOIN_CREATE_OFFLINE = "Connect to the internet to join or create a trip."

const PROFILE_KEY = "waybill.profile"
const LOCAL_STORE_KEY = "waybill.store"

export type Health = {
  mode: StorageMode
  warning: string | null
  /** Transient reachability failure (not a storage config issue). */
  notice?: string | null
  connected: boolean
  error?: string | null
  ledgerVersion?: number | null
  ledgerDataBytes?: number | null
  profileCount?: number | null
  tripCount?: number | null
  expenseCount?: number | null
  paymentCount?: number | null
  sessionReady?: boolean
}

const HEALTH_CACHE_MS = 5 * 60_000
const HEALTH_PERSIST_MS = 30 * 60_000
const HEALTH_PERSIST_KEY = "waybill.health"
const HEALTH_REQUEST_TIMEOUT_MS = 12_000

let mode: StorageMode = "local"
let healthCache: { health: Health; at: number } | null = null
let healthInFlight: Promise<Health> | null = null

function readPersistedHealth(): Health | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(HEALTH_PERSIST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { health: Health; at: number }
    if (Date.now() - parsed.at > HEALTH_PERSIST_MS) return null
    return parsed.health
  } catch {
    return null
  }
}

function persistHealthSnapshot(health: Health) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(
      HEALTH_PERSIST_KEY,
      JSON.stringify({ health: { ...health, notice: null }, at: Date.now() })
    )
  } catch {
    /* quota / private mode */
  }
}

function hydrateHealthCacheFromSession() {
  if (healthCache) return
  const persisted = readPersistedHealth()
  if (!persisted) return
  healthCache = { health: persisted, at: Date.now() }
  mode = persisted.mode
}

function syncModeFromPersistedHealth() {
  if (mode !== "local") return
  hydrateHealthCacheFromSession()
}

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

export function cachedGroupById(id: string): Group | null {
  if (typeof window === "undefined" || !id.trim()) return null
  return readLocalStore().groups.find((item) => item.id === id) ?? null
}

export function persistGroupSnapshot(group: Group) {
  if (typeof window === "undefined") return
  try {
    writeLocalStore(storeWithTrip(readLocalStore(), group))
  } catch {
    /* quota / private mode */
  }
}

function applyPendingOutbox(group: Group): Group {
  let next = group
  for (const op of browserOutbox().list().filter((item) => item.groupId === group.id)) {
    try {
      next = previewGroupPatch(next, op.body)
    } catch {
      /* skip a body that no longer applies */
    }
  }
  return next
}

function requireNetworkForInvite() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error(JOIN_CREATE_OFFLINE)
  }
}

function inviteNetworkError(error: unknown): never {
  if (isNetworkError(error)) throw new Error(JOIN_CREATE_OFFLINE)
  throw error
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
  syncModeFromPersistedHealth()
  if (mode === "unconfigured") {
    return loadSavedProfile()
  }
  try {
    const data = await request<{ profile: PublicProfile | null }>("/api/auth/session")
    if (data.profile) saveProfile(data.profile)
    return data.profile
  } catch (error) {
    if (isNetworkError(error)) return loadSavedProfile()
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
  syncModeFromPersistedHealth()
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
    browserOutbox().clear()
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
  const notice =
    "Could not reach the server ledger (timed out). Retry or check connection."
  const stale = healthCache?.health ?? readPersistedHealth()
  if (stale && stale.mode !== "unconfigured") {
    mode = stale.mode
    return { ...stale, notice: null }
  }
  mode = "unconfigured"
  return {
    mode: "unconfigured",
    warning: null,
    notice,
    connected: false,
    error: "Health check failed.",
  }
}

async function requestHealthFromServer(allowRetry: boolean): Promise<Health> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch("/api/health", {
      credentials: "include",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    })
    const data = (await response.json().catch(() => ({}))) as Health & { error?: string }
    if (!response.ok) {
      throw new Error(data.error || "Health check failed.")
    }
    mode = data.mode
    const health = { ...data, notice: null }
    healthCache = { health, at: Date.now() }
    persistHealthSnapshot(health)
    void drainGroupOutbox()
    return health
  } catch (error) {
    if (allowRetry) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      return requestHealthFromServer(false)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function loadHealth(options?: { force?: boolean }): Promise<Health> {
  hydrateHealthCacheFromSession()
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

export async function fetchPublicProfileByUsername(
  username: string
): Promise<PublicProfileView> {
  if (mode === "unconfigured") {
    const store = readLocalStore()
    const match = findProfileForContactSearch(store, `@${username}`)
    if (!match?.username) throw new Error("Profile not found.")
    return publicProfileView(match)
  }
  const data = await request<{ profile: PublicProfileView }>(
    `/api/profiles/view?username=${encodeURIComponent(username)}`
  )
  if (!data.profile) throw new Error("Profile not found.")
  return data.profile
}

export async function previewProfileForContactQuery(
  query: string
): Promise<PublicProfileView | null> {
  const q = query.trim()
  if (!q) return null
  if (mode === "unconfigured") {
    const match = findProfileForContactSearch(readLocalStore(), q)
    return match?.username ? publicProfileView(match) : null
  }
  const data = await request<{ profile: PublicProfileView | null }>(
    `/api/profiles/preview?q=${encodeURIComponent(q)}`
  )
  return data.profile ?? null
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

export type GroupCodeLookup = {
  group: Group
  joinRequest: JoinRequest | null
}

export async function fetchGroupByCode(code: string): Promise<GroupCodeLookup> {
  requireNetworkForInvite()
  if (mode === "unconfigured") {
    const store = readLocalStore()
    const group = groupByCode(store, code)
    if (!group) throw new Error("No trip uses that code.")
    const profileId = loadSavedProfile()?.id ?? ""
    return {
      group,
      joinRequest: profileId
        ? joinRequestForProfile(store, group.id, profileId)
        : null,
    }
  }
  try {
    const data = await request<{ group: Group; joinRequest?: JoinRequest | null }>(
      `/api/groups?code=${encodeURIComponent(code)}`
    )
    return { group: data.group, joinRequest: data.joinRequest ?? null }
  } catch (error) {
    inviteNetworkError(error)
  }
}

export type PendingTripInvite = {
  id: string
  groupId: string
  invitedEmail: string | null
  invitedPhone: string | null
  status: string
  tripName: string
}

export function pendingTripInviteBanner(
  invite: TripInvite | null | undefined,
  group: Group
): PendingTripInvite | null {
  if (!invite || invite.status !== "pending") return null
  return {
    id: invite.id,
    groupId: invite.groupId,
    invitedEmail: invite.invitedEmail,
    invitedPhone: invite.invitedPhone,
    status: invite.status,
    tripName: group.name,
  }
}

export async function fetchPendingTripInvites(): Promise<PendingTripInvite[]> {
  if (mode === "unconfigured") return []
  const data = await request<{ invites: PendingTripInvite[] }>("/api/trip-invites")
  return data.invites ?? []
}

export async function respondTripInvite(action: "accept" | "decline", inviteId: string) {
  if (mode === "unconfigured") throw new Error("Sign in and connect storage first.")
  const data = await request<{ group?: Group }>("/api/trip-invites", {
    method: "POST",
    body: JSON.stringify({ action, inviteId }),
  })
  return data.group ?? null
}

export type KnownContact = {
  id: string
  name: string
  username: string
  contactId: string
  source: "search" | "trip" | "invite"
  createdAt: string
}

export async function fetchKnownContacts(): Promise<KnownContact[]> {
  if (mode === "unconfigured") return []
  const data = await request<{ contacts: KnownContact[] }>("/api/contacts")
  return data.contacts ?? []
}

export async function addKnownContact(input: { query?: string; targetProfileId?: string }) {
  if (mode === "unconfigured") throw new Error("Sign in and connect storage first.")
  const data = await request<{ contacts: KnownContact[] }>("/api/contacts", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return data.contacts ?? []
}

export async function removeKnownContact(targetProfileId: string) {
  if (mode === "unconfigured") throw new Error("Sign in and connect storage first.")
  const data = await request<{ contacts: KnownContact[] }>("/api/contacts", {
    method: "POST",
    body: JSON.stringify({ action: "remove", targetProfileId }),
  })
  return data.contacts ?? []
}

export type PendingJoinRequestRow = JoinRequest & {
  profileName?: string
  profileUsername?: string | null
}

export type GroupFetchDetail = {
  group: Group
  joinRequest: JoinRequest | null
  pendingJoinRequests: PendingJoinRequestRow[]
  pendingTripInvites: TripInvite[]
  linkedProfiles: LinkedTripProfile[]
  viewerTripInvite: TripInvite | null
}

async function requestGroupById(
  id: string,
  joinCode?: string | null
): Promise<GroupFetchDetail> {
  const joinQuery =
    joinCode && joinCode.trim()
      ? `?join=${encodeURIComponent(joinCode.trim().toUpperCase())}`
      : ""
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`/api/groups/${id}${joinQuery}`, {
      credentials: "include",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    })
    const data = (await response.json().catch(() => ({}))) as {
      group?: Group
      joinRequest?: JoinRequest | null
      pendingJoinRequests?: PendingJoinRequestRow[]
      pendingTripInvites?: TripInvite[]
      linkedProfiles?: LinkedTripProfile[]
      viewerTripInvite?: TripInvite | null
      error?: string
    }
    if (response.status === 503 || data.error === "unconfigured") {
      mode = "unconfigured"
      throw new Error("unconfigured")
    }
    if (!response.ok) {
      throw new Error(data.error || "Request failed.")
    }
    if (!data.group) throw new Error("Trip not found.")
    return {
      group: data.group,
      joinRequest: data.joinRequest ?? null,
      pendingJoinRequests: data.pendingJoinRequests ?? [],
      pendingTripInvites: data.pendingTripInvites ?? [],
      linkedProfiles: data.linkedProfiles ?? [],
      viewerTripInvite: data.viewerTripInvite ?? null,
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.")
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchGroupDetail(
  id: string,
  options?: { skipHealth?: boolean; joinCode?: string | null }
): Promise<GroupFetchDetail> {
  syncModeFromPersistedHealth()
  await ensureClientMode(options)
  if (mode === "unconfigured") {
    const store = readLocalStore()
    const group = store.groups.find((item) => item.id === id)
    if (!group) throw new Error("Trip not found.")
    const saved = loadSavedProfile()
    const profileId = saved?.id ?? ""
    const fullProfile = profileId
      ? store.profiles.find((item) => item.id === profileId)
      : undefined
    const viewerTripInvite = fullProfile
      ? (pendingInvitesForProfile(store, publicProfile(fullProfile)).find(
          (item) => item.groupId === id
        ) ?? null)
      : null
    return {
      group,
      joinRequest: profileId ? joinRequestForProfile(store, id, profileId) : null,
      pendingJoinRequests: [],
      pendingTripInvites: [],
      linkedProfiles: linkedProfilesForGroup(store, group),
      viewerTripInvite,
    }
  }
  const detail = await requestGroupById(id, options?.joinCode)
  const merged = applyPendingOutbox(detail.group)
  persistGroupSnapshot(merged)
  return { ...detail, group: merged }
}

export async function fetchGroup(
  id: string,
  options?: { skipHealth?: boolean; joinCode?: string | null }
) {
  const detail = await fetchGroupDetail(id, options)
  return detail.group
}

export async function openTrip(input: {
  name: string
  memberNames: string[]
  createdByProfileId: string
  currency?: string
  startDate?: string | null
  endDate?: string | null
}) {
  requireNetworkForInvite()
  if (mode === "unconfigured") {
    const result = createGroup(readLocalStore(), input)
    writeLocalStore(result.store)
    return result.group
  }
  try {
    const data = await request<{ group: Group }>("/api/groups", {
      method: "POST",
      body: JSON.stringify(input),
    })
    persistGroupSnapshot(data.group)
    return data.group
  } catch (error) {
    inviteNetworkError(error)
  }
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
    return claimMemberWithJoinApproval(store, {
      groupId: id,
      memberId: String(body.memberId ?? ""),
      profileId,
    })
  }
  if (action === "request-join") {
    return requestJoin(store, {
      groupId: id,
      profileId,
      code: String(body.code ?? ""),
    })
  }
  if (action === "approve-join-request") {
    return approveJoinRequest(store, {
      groupId: id,
      requestId: String(body.requestId ?? ""),
      profileId,
    })
  }
  if (action === "reject-join-request") {
    return rejectJoinRequest(store, {
      groupId: id,
      requestId: String(body.requestId ?? ""),
      profileId,
    })
  }
  if (action === "send-trip-invite") {
    return sendTripInvite(store, {
      groupId: id,
      profileId,
      email: body.email as string | null | undefined,
      phone: body.phone as string | null | undefined,
      targetProfileId: body.targetProfileId as string | null | undefined,
    })
  }
  if (action === "revoke-trip-invite") {
    return revokeTripInvite(store, {
      groupId: id,
      inviteId: String(body.inviteId ?? ""),
      profileId,
    })
  }
  if (action === "add-member") {
    return addMember(store, id, String(body.name ?? ""), profileId)
  }
  if (action === "set-trip-admin") {
    return setTripAdmin(store, {
      groupId: id,
      actorProfileId: profileId,
      targetProfileId: String(body.targetProfileId ?? ""),
      isAdmin: Boolean(body.isAdmin),
    })
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
      expenseId: String(body.expenseId ?? ""),
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
      paymentId: String(body.paymentId ?? ""),
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
  if (action === "reorder-ledger-day") {
    return reorderLedgerDay(store, {
      groupId: id,
      profileId,
      date: String(body.date ?? ""),
      orderedIds: (body.orderedIds as string[]) ?? [],
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

function usesDurableOutbox() {
  return typeof window !== "undefined" && mode !== "unconfigured"
}

type DrainResultLike = {
  sent: number
  remaining: number
  paused: boolean
  dropped: number
  droppedError?: unknown
}

let drainInFlight: Promise<DrainResultLike> | null = null

export function outboxPendingCount(groupId?: string) {
  return browserOutbox().pendingCount(groupId)
}

export function subscribeOutbox(listener: () => void) {
  return browserOutbox().subscribe(listener)
}

async function patchGroupNetwork(id: string, body: Record<string, unknown>) {
  const data = await request<{ group: Group }>(`/api/groups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
  return data.group
}

export async function drainGroupOutbox(): Promise<DrainResultLike> {
  if (drainInFlight) return drainInFlight
  const run = (async () => {
    return browserOutbox().drain({
      isOnline: () => typeof navigator !== "undefined" && navigator.onLine,
      isRetryable: isRetryableSyncError,
      send: async (op: OutboxOp) => patchGroupNetwork(op.groupId, op.body),
      onSent: (_op, result) => {
        if (!result || typeof result !== "object" || !("id" in result)) return
        persistGroupSnapshot(applyPendingOutbox(result as Group))
      },
    })
  })()
  drainInFlight = run
  try {
    return await run
  } finally {
    drainInFlight = null
  }
}

let outboxSyncStarted = false

export function startOfflineOutboxSync() {
  if (typeof window === "undefined" || outboxSyncStarted) return
  outboxSyncStarted = true
  window.addEventListener("online", () => {
    void drainGroupOutbox()
  })
  if (navigator.onLine) void drainGroupOutbox()
}

/** Update UI immediately, persist locally, enqueue outbox, then PATCH when online. */
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
  const stamped = withClientPatchIds(body)
  let preview: Group
  try {
    preview = previewGroupPatch(group, stamped, actor)
  } catch (error) {
    handlers.onError(error instanceof Error ? error.message : "Update failed.")
    return
  }
  persistGroupSnapshot(preview)
  handlers.onApplied(preview)

  if (usesDurableOutbox()) {
    const opId = String(stamped.clientOpId ?? "")
    browserOutbox().enqueue({
      opId,
      groupId: group.id,
      body: stamped,
      createdAt: nowIso(),
    })
    void (async () => {
      try {
        let drained = await drainGroupOutbox()
        if (!drained.paused && browserOutbox().list().some((item) => item.opId === opId)) {
          drained = await drainGroupOutbox()
        }
        const stillQueued = browserOutbox()
          .list()
          .some((item) => item.opId === opId)
        if (stillQueued) {
          handlers.onError("Saved on this phone. Will sync when you're back online.")
          return
        }
        if (drained.dropped > 0) {
          const raw =
            drained.droppedError instanceof Error
              ? drained.droppedError.message
              : "Could not save."
          handlers.onError(raw.startsWith("Could not save") ? raw : `Could not save: ${raw}`)
          if (handlers.fetchLatest) {
            try {
              handlers.onReconciled?.(await handlers.fetchLatest())
            } catch {
              /* keep last applied state */
            }
          }
          return
        }
        handlers.onReconciled?.(cachedGroupById(group.id) ?? preview)
      } catch (error) {
        if (isRetryableSyncError(error)) {
          handlers.onError("Saved on this phone. Will sync when you're back online.")
          return
        }
        const raw = error instanceof Error ? error.message : "Could not save."
        handlers.onError(raw.startsWith("Could not save") ? raw : `Could not save: ${raw}`)
        if (handlers.fetchLatest) {
          try {
            handlers.onReconciled?.(await handlers.fetchLatest())
          } catch {
            /* keep last applied state */
          }
        }
      }
    })()
    return
  }

  void (async () => {
    try {
      const server = await patchGroup(group.id, stamped, preview)
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
  syncModeFromPersistedHealth()
  if (options?.skipHealth) return
  if (healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS) return
  if (mode !== "local" && mode !== "unconfigured") return
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
  const merged = applyPendingOutbox(data.group)
  writeLocalStore(storeWithTrip(readLocalStore(), merged))
  return merged
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
