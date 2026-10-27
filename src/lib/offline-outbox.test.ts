import assert from "node:assert/strict"
import test from "node:test"
import {
  createOutbox,
  isNetworkError,
  isRetryableSyncError,
  memoryStorage,
  withClientPatchIds,
  type OutboxOp,
} from "./offline-outbox"

function op(partial: Partial<OutboxOp> & Pick<OutboxOp, "opId">): OutboxOp {
  return {
    groupId: "g1",
    body: { action: "add-expense", clientOpId: partial.opId },
    createdAt: "2026-01-02T12:00:00.000Z",
    ...partial,
  }
}

test("enqueue is FIFO and skips duplicate opId", () => {
  const box = createOutbox(memoryStorage())
  box.enqueue(op({ opId: "op_a" }))
  box.enqueue(op({ opId: "op_b", createdAt: "2026-01-02T12:01:00.000Z" }))
  box.enqueue(op({ opId: "op_a" }))
  assert.equal(box.list().map((item) => item.opId).join(","), "op_a,op_b")
  assert.equal(box.pendingCount("g1"), 2)
  assert.equal(box.pendingCount("other"), 0)
})

test("drain sends FIFO then stops on retryable failure", async () => {
  const box = createOutbox(memoryStorage())
  box.enqueue(op({ opId: "op_a" }))
  box.enqueue(op({ opId: "op_b" }))
  const sent: string[] = []
  const first = await box.drain({
    isOnline: () => true,
    isRetryable: isRetryableSyncError,
    send: async (item) => {
      sent.push(item.opId)
      if (item.opId === "op_b") throw new Error("Request timed out. Check your connection.")
    },
  })
  assert.deepEqual(sent, ["op_a", "op_b"])
  assert.equal(first.sent, 1)
  assert.equal(first.paused, true)
  assert.equal(box.list().map((item) => item.opId).join(","), "op_b")

  sent.length = 0
  const second = await box.drain({
    isOnline: () => true,
    isRetryable: isRetryableSyncError,
    send: async (item) => {
      sent.push(item.opId)
    },
  })
  assert.deepEqual(sent, ["op_b"])
  assert.equal(second.sent, 1)
  assert.equal(second.paused, false)
  assert.equal(box.pendingCount(), 0)
})

test("drain does not send while offline", async () => {
  const box = createOutbox(memoryStorage())
  box.enqueue(op({ opId: "op_a" }))
  const result = await box.drain({
    isOnline: () => false,
    send: async () => {
      throw new Error("should not send")
    },
  })
  assert.equal(result.sent, 0)
  assert.equal(result.paused, true)
  assert.equal(box.pendingCount(), 1)
})

test("drain drops non-retryable errors so the queue is not stuck", async () => {
  const box = createOutbox(memoryStorage())
  box.enqueue(op({ opId: "op_bad" }))
  box.enqueue(op({ opId: "op_ok" }))
  const sent: string[] = []
  const result = await box.drain({
    isOnline: () => true,
    isRetryable: isRetryableSyncError,
    send: async (item) => {
      sent.push(item.opId)
      if (item.opId === "op_bad") throw new Error("Amount must be more than zero.")
    },
  })
  assert.deepEqual(sent, ["op_bad", "op_ok"])
  assert.equal(result.sent, 1)
  assert.equal(result.dropped, 1)
  assert.equal(box.pendingCount(), 0)
})

test("withClientPatchIds mints expenseId paymentId and clientOpId once", () => {
  let n = 0
  const mint = (prefix: string) => `${prefix}_${n++}`
  const first = withClientPatchIds({ action: "add-expense" }, mint)
  assert.equal(first.expenseId, "e_0")
  assert.equal(first.clientOpId, "op_1")
  const again = withClientPatchIds(first, mint)
  assert.equal(again.expenseId, "e_0")
  assert.equal(again.clientOpId, "op_1")
  const pay = withClientPatchIds({ action: "add-payment" }, mint)
  assert.equal(pay.paymentId, "pay_2")
})

test("isNetworkError vs retryable 401", () => {
  assert.equal(isNetworkError(new Error("Request timed out. Check your connection.")), true)
  assert.equal(isNetworkError(new Error("Sign in again.")), false)
  assert.equal(isRetryableSyncError(new Error("Sign in again.")), true)
  assert.equal(isRetryableSyncError(new Error("Expense not found.")), false)
})
