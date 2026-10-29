import {
  readGroupById,
  readProfilesByIds,
  readStore,
  readTripLedgerMeta,
  storageMode,
} from "@/lib/db"
import { linkedProfilesForGroup } from "@/lib/linked-trip-profiles"
import { canViewGroup } from "@/lib/trip-access"
import {
  isTripAdmin,
  joinRequestsForGroup,
  joinRequestForProfile,
  pendingInvitesForProfile,
  storeTripInvites,
} from "@/lib/trip-invites"
import { publicProfile, type Group, type Store, type TripInvite } from "@/lib/types"

export type TripGetPayload = {
  group: Group
  joinRequest: ReturnType<typeof joinRequestForProfile>
  pendingJoinRequests?: Array<
    import("@/lib/types").JoinRequest & {
      profileName?: string
      profileUsername?: string | null
    }
  >
  pendingTripInvites?: TripInvite[]
  linkedProfiles: ReturnType<typeof linkedProfilesForGroup>
  viewerTripInvite: TripInvite | null
}

async function resolveGroup(id: string): Promise<Group | null> {
  const group = await readGroupById(id)
  if (group) return group
  if (storageMode() === "postgres") return null
  const store = await readStore()
  return store.groups.find((item) => item.id === id) ?? null
}

export function profileIdsForTripContext(
  group: Group,
  joinRequests: Store["joinRequests"],
  sessionProfileId: string
): string[] {
  const ids = new Set<string>([sessionProfileId])
  for (const member of group.members) {
    if (member.profileId) ids.add(member.profileId)
  }
  for (const request of joinRequests ?? []) {
    if (request.groupId === group.id) ids.add(request.profileId)
  }
  return [...ids]
}

export async function loadTripGetPayload(
  groupId: string,
  sessionId: string,
  joinCode: string | null
): Promise<TripGetPayload | { error: "not_found" | "forbidden" }> {
  const [group, meta] = await Promise.all([
    resolveGroup(groupId),
    readTripLedgerMeta(groupId),
  ])
  if (!group) return { error: "not_found" }

  const joinRequests = meta.joinRequests
  if (!canViewGroup(sessionId, group, { joinCode, joinRequests })) {
    return { error: "forbidden" }
  }

  const profileIds = profileIdsForTripContext(group, joinRequests, sessionId)
  const profiles = await readProfilesByIds(profileIds)
  const sessionProfile = profiles.find((item) => item.id === sessionId) ?? null

  const store: Store = {
    profiles,
    groups: [group],
    joinRequests,
    tripInvites: meta.tripInvites,
  }

  const admin = isTripAdmin(group, sessionId)
  const pendingJoinRequests = admin
    ? joinRequestsForGroup(store, group.id)
        .filter((item) => item.status === "pending")
        .map((item) => ({
          ...item,
          profileName:
            store.profiles.find((profile) => profile.id === item.profileId)?.name ??
            "Traveler",
          profileUsername:
            store.profiles.find((profile) => profile.id === item.profileId)
              ?.username ?? null,
        }))
    : undefined
  const pendingTripInvites = admin
    ? storeTripInvites(store).filter(
        (item) => item.groupId === group.id && item.status === "pending"
      )
    : undefined

  const viewerTripInvite = sessionProfile
    ? (pendingInvitesForProfile(store, publicProfile(sessionProfile)).find(
        (item) => item.groupId === group.id
      ) ?? null)
    : null

  return {
    group,
    joinRequest: joinRequestForProfile(store, group.id, sessionId),
    pendingJoinRequests,
    pendingTripInvites,
    linkedProfiles: linkedProfilesForGroup(store, group),
    viewerTripInvite,
  }
}
