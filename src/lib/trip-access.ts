import type { Group } from "@/lib/types"

export function isGroupMember(profileId: string, group: Group): boolean {
  return group.members.some((member) => member.profileId === profileId)
}

export function normalizeJoinCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase()
}

export function canViewGroup(
  profileId: string,
  group: Group,
  opts?: { joinCode?: string | null }
): boolean {
  if (group.createdByProfileId === profileId) return true
  if (isGroupMember(profileId, group)) return true
  const code = normalizeJoinCode(opts?.joinCode)
  if (code && normalizeJoinCode(group.code) === code) return true
  return false
}
