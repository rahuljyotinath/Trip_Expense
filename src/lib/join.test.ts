import assert from "node:assert/strict"
import test from "node:test"
import { parseJoinInput } from "./join"

test("parseJoinInput extracts join param from URL", () => {
  assert.equal(
    parseJoinInput("https://example.com/?join=k7mp2q"),
    "K7MP2Q"
  )
})

test("parseJoinInput normalizes bare code", () => {
  assert.equal(parseJoinInput("  ab12cd  "), "AB12CD")
})

test("parseJoinInput empty", () => {
  assert.equal(parseJoinInput(""), "")
  assert.equal(parseJoinInput("   "), "")
})

test("parseJoinInput trip URL with join query", () => {
  assert.equal(
    parseJoinInput("https://app.example/trip/g_abc?join=ABCDEF"),
    "ABCDEF"
  )
})
