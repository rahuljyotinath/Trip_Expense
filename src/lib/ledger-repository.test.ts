import assert from "node:assert/strict"
import test from "node:test"
import { signUp } from "./auth-ops"
import { createGroup } from "./operations"
import { storesEqualNormalized } from "./ledger-repository"
import { emptyStore, normalizeStore } from "./types"

test("storesEqualNormalized detects equivalent normalized stores", async () => {
  const signed = await signUp(emptyStore(), {
    username: "ada_repo",
    password: "secret123",
    name: "Ada",
  })
  const { store: s2 } = createGroup(signed.store, {
    name: "Goa",
    memberNames: ["Ada", "Bob"],
    createdByProfileId: signed.profile.id,
  })
  const roundTrip = normalizeStore(JSON.parse(JSON.stringify(s2)))
  assert.equal(storesEqualNormalized(s2, roundTrip), true)
})
