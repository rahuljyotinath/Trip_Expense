import assert from "node:assert/strict"
import test from "node:test"
import { buildUpiPayUrl, validateUpiId } from "@/lib/upi"

test("validateUpiId accepts common VPA", () => {
  assert.equal(validateUpiId("rahul@okicici"), "rahul@okicici")
  assert.equal(validateUpiId("  Rahul@Paytm "), "rahul@paytm")
})

test("validateUpiId rejects garbage", () => {
  assert.throws(() => validateUpiId("not-upi"))
})

test("buildUpiPayUrl encodes amount and note", () => {
  const url = buildUpiPayUrl({
    payeeAddress: "friend@ybl",
    payeeName: "Friend",
    amount: 150.5,
    note: "Tripzy settle",
  })
  assert.match(url, /^upi:\/\/pay\?/)
  assert.match(url, /pa=friend%40ybl/)
  assert.match(url, /am=150\.50/)
})
