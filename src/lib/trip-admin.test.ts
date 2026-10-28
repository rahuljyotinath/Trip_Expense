import assert from "node:assert/strict"
import test from "node:test"
import {
  addMember,
  claimMember,
  createGroup,
  createProfile,
  sendTripInvite,
  setTripAdmin,
} from "./operations"
import { isTripAdmin } from "./trip-invites"
import { emptyStore } from "./types"

test("isTripAdmin includes creator and adminProfileIds", () => {
  const { store, profile: creator } = createProfile(emptyStore(), "Creator")
  const { store: s1, group } = createGroup(store, {
    name: "Goa",
    memberNames: ["Creator", "Friend"],
    createdByProfileId: creator.id,
  })
  const { store: s2, profile: friend } = createProfile(s1, "Friend")
  const friendSeat = group.members.find((m) => m.name === "Friend")
  assert.ok(friendSeat)
  const { store: s3, group: linked } = claimMember(s2, {
    groupId: group.id,
    memberId: friendSeat.id,
    profileId: friend.id,
  })
  assert.equal(isTripAdmin(linked, creator.id), true)
  assert.equal(isTripAdmin(linked, friend.id), false)
  const { group: delegated } = setTripAdmin(s3, {
    groupId: group.id,
    actorProfileId: creator.id,
    targetProfileId: friend.id,
    isAdmin: true,
  })
  assert.equal(isTripAdmin(delegated, friend.id), true)
})

test("non-admin seated member cannot add roster nicknames", () => {
  const { store, profile: creator } = createProfile(emptyStore(), "Creator")
  const { store: s1, group } = createGroup(store, {
    name: "Goa",
    memberNames: ["Creator", "Friend", "Guest"],
    createdByProfileId: creator.id,
  })
  const { store: s2, profile: friend } = createProfile(s1, "Friend")
  const friendSeat = group.members.find((m) => m.name === "Friend")
  assert.ok(friendSeat)
  const { store: s3 } = claimMember(s2, {
    groupId: group.id,
    memberId: friendSeat.id,
    profileId: friend.id,
  })
  assert.throws(
    () => addMember(s3, group.id, "New Nick", friend.id),
    /Only a trip admin/
  )
})

test("delegated admin can send trip invites", () => {
  const { store, profile: creator } = createProfile(emptyStore(), "Creator")
  const { store: s1, group } = createGroup(store, {
    name: "Goa",
    memberNames: ["Creator", "Friend"],
    createdByProfileId: creator.id,
  })
  const { store: s2, profile: friend } = createProfile(s1, "Friend")
  const friendSeat = group.members.find((m) => m.name === "Friend")
  assert.ok(friendSeat)
  const { store: s3 } = claimMember(s2, {
    groupId: group.id,
    memberId: friendSeat.id,
    profileId: friend.id,
  })
  const { store: s4 } = setTripAdmin(s3, {
    groupId: group.id,
    actorProfileId: creator.id,
    targetProfileId: friend.id,
    isAdmin: true,
  })
  const { store: s5 } = sendTripInvite(s4, {
    groupId: group.id,
    profileId: friend.id,
    email: "stranger@example.com",
  })
  const invites = s5.tripInvites ?? []
  assert.equal(invites.filter((i) => i.groupId === group.id).length, 1)
})

test("creator admin access cannot be revoked", () => {
  const { store, profile: creator } = createProfile(emptyStore(), "Creator")
  const { store: s1, group } = createGroup(store, {
    name: "Goa",
    memberNames: ["Creator", "Friend"],
    createdByProfileId: creator.id,
  })
  assert.throws(
    () =>
      setTripAdmin(s1, {
        groupId: group.id,
        actorProfileId: creator.id,
        targetProfileId: creator.id,
        isAdmin: false,
      }),
    /creator always stays an admin/
  )
  assert.equal(isTripAdmin(group, creator.id), true)
})
