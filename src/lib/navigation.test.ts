import assert from "node:assert/strict"
import test from "node:test"
import { safeReturnPath } from "./navigation"

test("safeReturnPath accepts in-app paths", () => {
  assert.equal(safeReturnPath("/trip/g_1"), "/trip/g_1")
  assert.equal(safeReturnPath("/trip/g_1/analytics"), "/trip/g_1/analytics")
  assert.equal(safeReturnPath("/login?next=/trip/g_1"), "/login?next=/trip/g_1")
})

test("safeReturnPath rejects external and empty", () => {
  assert.equal(safeReturnPath("//evil.com"), "/")
  assert.equal(safeReturnPath("https://evil.com"), "/")
  assert.equal(safeReturnPath(""), "/")
  assert.equal(safeReturnPath(null, "/home"), "/home")
})
