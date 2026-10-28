import type { Group, LinkedTripProfile, Store } from "@/lib/types"
import { publicProfileView } from "@/lib/types"

export function linkedProfilesForGroup(store: Store, group: Group): LinkedTripProfile[] {
  const seen = new Set<string>()
  const out: LinkedTripProfile[] = []
  for (const member of group.members) {
    const profileId = member.profileId
    if (!profileId || seen.has(profileId)) continue
    const profile = store.profiles.find((item) => item.id === profileId)
    if (!profile?.username?.trim()) continue
    seen.add(profileId)
    out.push({
      profileId,
      ...publicProfileView(profile),
      upiId: profile.upiId ?? null,
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export function usernameForMemberProfile(
  linked: LinkedTripProfile[],
  profileId: string | null | undefined
) {
  if (!profileId) return null
  return linked.find((item) => item.profileId === profileId)?.username ?? null
}
