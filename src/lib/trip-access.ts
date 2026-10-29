import type { Group, JoinRequest, TripJoinPreview } from "@/lib/types"
import { isTripAdmin } from "@/lib/trip-invites"

export function isGroupMember(profileId: string, group: Group): boolean {
  return group.members.some((member) => member.profileId === profileId)
}

export function normalizeJoinCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase()
}

export function canViewGroup(
  profileId: string,
  group: Group,
  opts?: { joinCode?: string | null; joinRequests?: JoinRequest[] }
): boolean {
  if (isTripAdmin(group, profileId)) return true
  if (isGroupMember(profileId, group)) return true
  if (group.joinApprovalRequired) {
    const approved = (opts?.joinRequests ?? []).some(
      (item) =>
        item.groupId === group.id &&
        item.profileId === profileId &&
        item.status === "approved"
    )
    if (!approved) return false
  }
  const code = normalizeJoinCode(opts?.joinCode)
  if (code && normalizeJoinCode(group.code) === code) return true
  return false
}

export function tripJoinPreview(group: Group, profileId: string, joinRequests: JoinRequest[] = []): TripJoinPreview {
  const visible = canViewGroup(profileId, group, { joinCode: group.code, joinRequests })
  return {
    id: group.id, name: group.name, code: group.code,
    joinApprovalRequired: group.joinApprovalRequired,
    alreadySeated: isGroupMember(profileId, group),
    members: visible ? group.members.map(({ id, name, profileId }) => ({ id, name, taken: Boolean(profileId) })) : [],
  }
}
