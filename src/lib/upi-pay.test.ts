import assert from "node:assert/strict"
import test from "node:test"
import { buildUpiPayUri, isLikelyUpiVpa } from "./upi-pay"

test("buildUpiPayUri formats amount and currency", () => {
  const uri = buildUpiPayUri({
    vpa: "friend@upi",
    payeeName: "Rahul",
    amount: 250.5,
    note: "Trip settle",
  })
  assert.match(uri, /^upi:\/\/pay\?/)
  assert.match(uri, /pa=friend%40upi/)
  assert.match(uri, /am=250\.50/)
  assert.match(uri, /cu=INR/)
})

test("isLikelyUpiVpa validates handle", () => {
  assert.equal(isLikelyUpiVpa("name@okaxis"), true)
  assert.equal(isLikelyUpiVpa("not-an-email"), false)
})
