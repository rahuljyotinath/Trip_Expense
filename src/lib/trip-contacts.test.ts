import assert from "node:assert/strict"
import test from "node:test"
import {
  addContact,
  claimMember,
  createGroup,
  createProfile,
  removeContact,
  sendTripInvite,
} from "./operations"
import { findProfileForContactSearch, listContactsForProfile } from "./trip-contacts"
import { emptyStore } from "./types"

test("findProfileForContactSearch exact username email phone", () => {
  const { store, profile } = createProfile(emptyStore(), "Ada")
  const withUser = {
    ...store,
    profiles: store.profiles.map((item) =>
      item.id === profile.id
        ? {
            ...item,
            username: "ada",
            email: "ada@example.com",
            phone: "9876543210",
          }
        : item
    ),
  }
  assert.equal(findProfileForContactSearch(withUser, "@ada")?.id, profile.id)
  assert.equal(findProfileForContactSearch(withUser, "ada@example.com")?.id, profile.id)
  assert.equal(findProfileForContactSearch(withUser, "9876543210")?.id, profile.id)
  assert.equal(findProfileForContactSearch(withUser, "missing"), null)
})

test("addContact idempotent and one-way", () => {
  const { store, profile: a } = createProfile(emptyStore(), "A")
  const { store: s1, profile: b } = createProfile(store, "B")
  const withB = {
    ...s1,
    profiles: s1.profiles.map((item) =>
      item.id === b.id ? { ...item, username: "bob" } : item
    ),
  }
  const { store: s2 } = addContact(withB, {
    ownerProfileId: a.id,
    query: "@bob",
  })
  const { store: s3 } = addContact(s2, {
    ownerProfileId: a.id,
    query: "@bob",
  })
  assert.equal((s3.contacts ?? []).length, 1)
  assert.equal(listContactsForProfile(s3, a.id).length, 1)
  assert.equal(listContactsForProfile(s3, b.id).length, 0)
})

test("claimMember syncs trip contacts for linked profiles", () => {
  const { store, profile: admin } = createProfile(emptyStore(), "Admin")
  const { store: s1, group } = createGroup(store, {
    name: "Trip",
    memberNames: ["Admin", "Friend"],
    createdByProfileId: admin.id,
  })
  const adminMember = group.members.find((m) => m.name === "Admin")!
  const friendMember = group.members.find((m) => m.name === "Friend")!
  const { store: s2, profile: friend } = createProfile(s1, "Friend")
  const { store: s3 } = claimMember(s2, {
    groupId: group.id,
    memberId: adminMember.id,
    profileId: admin.id,
  })
  const { store: s4 } = claimMember(s3, {
    groupId: group.id,
    memberId: friendMember.id,
    profileId: friend.id,
  })
  assert.equal(listContactsForProfile(s4, admin.id).length, 1)
  assert.equal(listContactsForProfile(s4, friend.id).length, 1)
})

test("sendTripInvite adds invite-source contact when profile matches", () => {
  const { store, profile: admin } = createProfile(emptyStore(), "Admin")
  const { store: s1, group } = createGroup(store, {
    name: "Trip",
    memberNames: ["Admin", "Friend"],
    createdByProfileId: admin.id,
  })
  const { store: s2, profile: friend } = createProfile(s1, "Friend")
  const withFriend = {
    ...s2,
    profiles: s2.profiles.map((item) =>
      item.id === friend.id ? { ...item, email: "friend@example.com" } : item
    ),
  }
  const { store: s3 } = sendTripInvite(withFriend, {
    groupId: group.id,
    profileId: admin.id,
    email: "friend@example.com",
  })
  const row = (s3.contacts ?? []).find(
    (item) => item.ownerProfileId === admin.id && item.targetProfileId === friend.id
  )
  assert.equal(row?.source, "invite")
})

test("removeContact", () => {
  const { store, profile: a } = createProfile(emptyStore(), "A")
  const { store: s1, profile: b } = createProfile(store, "B")
  const withB = {
    ...s1,
    profiles: s1.profiles.map((item) =>
      item.id === b.id ? { ...item, username: "bob" } : item
    ),
  }
  const { store: s2 } = addContact(withB, {
    ownerProfileId: a.id,
    targetProfileId: b.id,
  })
  const { store: s3, contacts } = removeContact(s2, {
    ownerProfileId: a.id,
    targetProfileId: b.id,
  })
  assert.equal(contacts.length, 0)
  assert.equal((s3.contacts ?? []).length, 0)
})
