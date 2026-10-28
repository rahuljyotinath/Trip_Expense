import assert from "node:assert/strict"
import test from "node:test"
import { tripJoinPath, tripJoinUrl } from "./trip-invite-url"

test("tripJoinPath encodes join query", () => {
  assert.equal(tripJoinPath("g1", "abc123"), "/trip/g1?join=ABC123")
})

test("tripJoinUrl builds absolute link", () => {
  assert.equal(
    tripJoinUrl("g1", "xyz", "https://app.example"),
    "https://app.example/trip/g1?join=XYZ"
  )
})
