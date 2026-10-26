import type { Group, Profile, PublicProfile, Store } from "@/lib/types"

export function profileFromPublic(pub: PublicProfile): Profile {
  return {
    id: pub.id,
    username: pub.username,
    passwordHash: "",
    name: pub.name,
    email: pub.email,
    phone: pub.phone,
    createdAt: pub.createdAt,
  }
}

export function upsertProfileInStore(store: Store, pub: PublicProfile): Store {
  const profile = profileFromPublic(pub)
  const index = store.profiles.findIndex((item) => item.id === profile.id)
  if (index === -1) {
    return { ...store, profiles: [...store.profiles, profile] }
  }
  const profiles = store.profiles.slice()
  profiles[index] = { ...profiles[index]!, ...profile, passwordHash: profiles[index]!.passwordHash || "" }
  return { ...store, profiles }
}

export function storeWithTrip(store: Store, group: Group): Store {
  const has = store.groups.some((item) => item.id === group.id)
  return {
    ...store,
    groups: has
      ? store.groups.map((item) => (item.id === group.id ? group : item))
      : [group, ...store.groups],
  }
}

/** Store shape used for optimistic PATCH previews (GitHub mode: inject session profile). */
export function preparePatchStore(
  store: Store,
  group: Group,
  session: PublicProfile | null
): Store {
  let next = storeWithTrip(store, group)
  if (session) next = upsertProfileInStore(next, session)
  return next
}
