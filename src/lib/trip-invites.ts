import type { Group, JoinRequest, Profile, PublicProfile, Store, TripInvite } from "./types"

export function normalizeInviteEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase()
  return email.length > 0 ? email : null
}

export function normalizeInvitePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "")
  return digits.length >= 10 ? digits : null
}

export function profileMatchesInvite(
  profile: Pick<Profile, "email" | "phone">,
  invite: TripInvite
): boolean {
  const email = normalizeInviteEmail(profile.email)
  const phone = normalizeInvitePhone(profile.phone)
  const inviteEmail = normalizeInviteEmail(invite.invitedEmail)
  const invitePhone = normalizeInvitePhone(invite.invitedPhone)
  if (inviteEmail && email && inviteEmail === email) return true
  if (invitePhone && phone && invitePhone === phone) return true
  return false
}

export function isTripAdmin(group: Group, profileId: string): boolean {
  if (group.createdByProfileId === profileId) return true
  return (group.adminProfileIds ?? []).includes(profileId)
}

export function storeJoinRequests(store: Store): JoinRequest[] {
  return store.joinRequests ?? []
}

export function storeTripInvites(store: Store): TripInvite[] {
  return store.tripInvites ?? []
}

export function joinRequestsForGroup(store: Store, groupId: string): JoinRequest[] {
  return storeJoinRequests(store).filter((item) => item.groupId === groupId)
}

export function joinRequestForProfile(
  store: Store,
  groupId: string,
  profileId: string
): JoinRequest | null {
  return (
    storeJoinRequests(store).find(
      (item) => item.groupId === groupId && item.profileId === profileId
    ) ?? null
  )
}

export function pendingInvitesForProfile(store: Store, profile: PublicProfile): TripInvite[] {
  const full = store.profiles.find((item) => item.id === profile.id)
  if (!full) return []
  return storeTripInvites(store).filter(
    (invite) => invite.status === "pending" && profileMatchesInvite(full, invite)
  )
}

export function groupNameById(store: Store, groupId: string): string {
  return store.groups.find((item) => item.id === groupId)?.name ?? "Trip"
}
