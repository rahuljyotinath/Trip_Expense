import assert from "node:assert/strict"
import test from "node:test"
import {
  acceptTripInvite,
  createGroup,
  createProfile,
  requestJoin,
  sendTripInvite,
} from "./operations"
import { canViewGroup } from "./trip-access"
import { profileMatchesInvite, pendingInvitesForProfile } from "./trip-invites"
import { emptyStore, publicProfile, type TripInvite } from "./types"

test("profileMatchesInvite email or phone", () => {
  const invite: TripInvite = {
    id: "inv1",
    groupId: "g1",
    invitedEmail: "a@example.com",
    invitedPhone: null,
    status: "pending",
    createdByProfileId: "p0",
    createdAt: "",
    respondedAt: null,
    respondedByProfileId: null,
  }
  assert.equal(
    profileMatchesInvite({ email: "A@example.com", phone: null }, invite),
    true
  )
  assert.equal(
    profileMatchesInvite({ email: null, phone: "9876543210" }, invite),
    false
  )
})

test("new trips require join approval and code request flow", () => {
  const { store, profile } = createProfile(emptyStore(), "Admin")
  const { store: s1, group } = createGroup(store, {
    name: "Goa",
    memberNames: ["Admin", "Friend"],
    createdByProfileId: profile.id,
  })
  assert.equal(group.joinApprovalRequired, true)
  const { store: s2, profile: stranger } = createProfile(s1, "Stranger")
  const { store: s3, joinRequest } = requestJoin(s2, {
    groupId: group.id,
    profileId: stranger.id,
    code: group.code,
  })
  assert.equal(joinRequest.status, "pending")
  assert.equal(
    canViewGroup(stranger.id, group, {
      joinCode: group.code,
      joinRequests: s3.joinRequests,
    }),
    false
  )
})

test("send and list pending invite", () => {
  const { store, profile } = createProfile(emptyStore(), "Admin")
  const { store: s1, group } = createGroup(store, {
    name: "Goa",
    memberNames: ["Admin", "Friend"],
    createdByProfileId: profile.id,
  })
  const { store: s2 } = sendTripInvite(s1, {
    groupId: group.id,
    profileId: profile.id,
    email: "friend@example.com",
  })
  const { store: sBase, profile: friendRaw } = createProfile(s2, "Friend")
  const friend = { ...friendRaw, email: "friend@example.com", phone: "9876543210" }
  const storeWithFriend = {
    ...sBase,
    profiles: sBase.profiles.map((item) =>
      item.id === friend.id ? { ...item, email: friend.email, phone: friend.phone } : item
    ),
  }
  const pending = pendingInvitesForProfile(storeWithFriend, publicProfile(friend))
  assert.equal(pending.length, 1)
  const { store: s3 } = acceptTripInvite(storeWithFriend, {
    inviteId: pending[0]!.id,
    profileId: friend.id,
  })
  const approved = s3.joinRequests?.find(
    (item) => item.groupId === group.id && item.profileId === friend.id
  )
  assert.equal(approved?.status, "pending")
})
