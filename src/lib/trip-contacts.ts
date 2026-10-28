import { findProfileByUsername, normalizeUsername } from "@/lib/auth-ops"
import { normalizeInviteEmail, normalizeInvitePhone } from "@/lib/trip-invites"
import type { Contact, ContactSource, Profile, PublicProfile, Store } from "@/lib/types"
import { publicProfile } from "@/lib/types"
import { nowIso, uid } from "@/lib/ids"

export function storeContacts(store: Store): Contact[] {
  return store.contacts ?? []
}

export function contactPairKey(ownerProfileId: string, targetProfileId: string) {
  return `${ownerProfileId}:${targetProfileId}`
}

export function findProfileForContactSearch(store: Store, rawQuery: string): Profile | null {
  const query = rawQuery.trim()
  if (!query) return null
  if (query.startsWith("@")) {
    const username = normalizeUsername(query.slice(1))
    return findProfileByUsername(store, username)
  }
  const email = normalizeInviteEmail(query)
  if (email && query.includes("@")) {
    return store.profiles.find((item) => normalizeInviteEmail(item.email) === email) ?? null
  }
  const phone = normalizeInvitePhone(query)
  if (phone) {
    return (
      store.profiles.find((item) => normalizeInvitePhone(item.phone) === phone) ?? null
    )
  }
  const asUser = normalizeUsername(query)
  if (asUser) {
    const byUsername = findProfileByUsername(store, asUser)
    if (byUsername) return byUsername
  }
  return null
}

export type EnrichedContact = PublicProfile & {
  contactId: string
  source: ContactSource
  createdAt: string
}

export function listContactsForProfile(
  store: Store,
  ownerProfileId: string
): EnrichedContact[] {
  const rows = storeContacts(store).filter((item) => item.ownerProfileId === ownerProfileId)
  const out: EnrichedContact[] = []
  for (const row of rows) {
    const profile = store.profiles.find((item) => item.id === row.targetProfileId)
    if (!profile) continue
    out.push({
      ...publicProfile(profile),
      contactId: row.id,
      source: row.source,
      createdAt: row.createdAt,
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export function upsertContactInStore(
  store: Store,
  input: {
    ownerProfileId: string
    targetProfileId: string
    source: ContactSource
  }
): Store {
  if (input.ownerProfileId === input.targetProfileId) return store
  const existing = storeContacts(store).find(
    (item) =>
      item.ownerProfileId === input.ownerProfileId &&
      item.targetProfileId === input.targetProfileId
  )
  if (existing) return store
  const contact: Contact = {
    id: uid("c"),
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
    source: input.source,
    createdAt: nowIso(),
  }
  return { ...store, contacts: [...storeContacts(store), contact] }
}

export function syncTripContacts(store: Store, groupId: string): Store {
  const group = store.groups.find((item) => item.id === groupId)
  if (!group) return store
  const profileIds = [
    ...new Set(
      group.members
        .map((member) => member.profileId)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  let next = store
  for (let i = 0; i < profileIds.length; i++) {
    for (let j = i + 1; j < profileIds.length; j++) {
      const a = profileIds[i]!
      const b = profileIds[j]!
      next = upsertContactInStore(next, {
        ownerProfileId: a,
        targetProfileId: b,
        source: "trip",
      })
      next = upsertContactInStore(next, {
        ownerProfileId: b,
        targetProfileId: a,
        source: "trip",
      })
    }
  }
  return next
}

export function assertRosterProfileIdsAreFriends(
  store: Store,
  ownerProfileId: string,
  roster: Array<{ profileId?: string | null }>
) {
  const friendIds = new Set(
    storeContacts(store)
      .filter((item) => item.ownerProfileId === ownerProfileId)
      .map((item) => item.targetProfileId)
  )
  for (const row of roster) {
    const id = row.profileId?.trim()
    if (!id || id === ownerProfileId) continue
    if (!friendIds.has(id)) {
      throw new Error("Add them as a friend first.")
    }
  }
}

export function removeContactFromStore(
  store: Store,
  ownerProfileId: string,
  targetProfileId: string
): Store {
  const next = storeContacts(store).filter(
    (item) =>
      !(
        item.ownerProfileId === ownerProfileId &&
        item.targetProfileId === targetProfileId
      )
  )
  if (next.length === storeContacts(store).length) return store
  return { ...store, contacts: next }
}
