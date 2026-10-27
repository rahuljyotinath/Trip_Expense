import type { Group, JoinRequest } from "@/lib/types"

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
  if (group.createdByProfileId === profileId) return true
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
