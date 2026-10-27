import assert from "node:assert/strict"
import test from "node:test"
import { claimMember, createGroup, createProfile } from "./operations"
import { linkedProfilesForGroup } from "./linked-trip-profiles"
import { emptyStore } from "./types"

test("linkedProfilesForGroup lists seated profiles without email", () => {
  const { store, profile: admin } = createProfile(emptyStore(), "Admin")
  const withAdmin = {
    ...store,
    profiles: store.profiles.map((item) =>
      item.id === admin.id ? { ...item, username: "admin" } : item
    ),
  }
  const { store: s1, group } = createGroup(withAdmin, {
    name: "Trip",
    memberNames: ["Admin", "Friend"],
    createdByProfileId: admin.id,
  })
  const { store: s2, profile: friend } = createProfile(s1, "Friend")
  const withFriend = {
    ...s2,
    profiles: s2.profiles.map((item) =>
      item.id === friend.id
        ? { ...item, username: "friend", email: "f@example.com" }
        : item
    ),
  }
  const adminMember = group.members.find((m) => m.name === "Admin")!
  const { store: s3 } = claimMember(withFriend, {
    groupId: group.id,
    memberId: adminMember.id,
    profileId: admin.id,
  })
  const linked = linkedProfilesForGroup(s3, group)
  assert.equal(linked.length, 1)
  assert.equal(linked[0]?.username, "admin")
  assert.equal("email" in (linked[0] ?? {}), false)
})
