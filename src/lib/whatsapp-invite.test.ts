import assert from "node:assert/strict"
import test from "node:test"
import { whatsappInviteMessage, whatsappShareUrl } from "./whatsapp-invite"

test("whatsappInviteMessage includes trip name and url", () => {
  const msg = whatsappInviteMessage("Goa 2026", "https://example.com/trip/g1")
  assert.match(msg, /Goa 2026/)
  assert.match(msg, /https:\/\/example.com\/trip\/g1/)
  assert.match(msg, /Trip ka hisaab/)
})

test("whatsappShareUrl encodes text", () => {
  const url = whatsappShareUrl("hello world")
  assert.match(url, /^https:\/\/wa\.me\/\?text=/)
  assert.match(url, /hello/)
})
