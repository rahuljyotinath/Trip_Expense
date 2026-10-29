import { uid } from "@/lib/ids"

export const OUTBOX_KEY = "waybill.outbox"

export type OutboxOp = {
  opId: string
  groupId: string
  body: Record<string, unknown>
  createdAt: string
  profileId?: string
  failedError?: string
}

export type OutboxStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
  readonly length?: number
  key?(index: number): string | null
}

export type DrainResult = {
  sent: number
  remaining: number
  paused: boolean
  dropped: number
  error?: unknown
  droppedError?: unknown
}

export type DrainHooks = {
  isOnline: () => boolean
  send: (op: OutboxOp) => Promise<unknown>
  isRetryable?: (error: unknown) => boolean
  onSent?: (op: OutboxOp, result: unknown) => void
}

function readOps(storage: OutboxStorage): OutboxOp[] {
  try {
    const raw = storage.getItem(OUTBOX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is OutboxOp => {
      if (!item || typeof item !== "object") return false
      const row = item as Partial<OutboxOp>
      return Boolean(row.opId && row.groupId && row.body && typeof row.body === "object")
    })
  } catch {
    return []
  }
}

export function memoryStorage(): OutboxStorage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

export function withClientPatchIds(
  body: Record<string, unknown>,
  mint: (prefix: string) => string = uid
): Record<string, unknown> {
  const next = { ...body }
  if (next.action === "add-expense" && !String(next.expenseId ?? "").trim()) {
    next.expenseId = mint("e")
  }
  if (next.action === "add-payment" && !String(next.paymentId ?? "").trim()) {
    next.paymentId = mint("pay")
  }
  if (!String(next.clientOpId ?? "").trim()) {
    next.clientOpId = mint("op")
  }
  return next
}

export function isNetworkError(error: unknown) {
  if (error instanceof TypeError) return true
  const message = error instanceof Error ? error.message : String(error)
  return /timed out|failed to fetch|networkerror|load failed|network/i.test(message)
}

export function isRetryableSyncError(error: unknown) {
  if (isNetworkError(error)) return true
  const status = (error as { status?: number })?.status
  if (status === 401 || status === 408 || status === 409 || status === 429 || (status && status >= 500)) return true
  const message = error instanceof Error ? error.message : String(error)
  return /unconfigured|sign in again|version conflict|temporarily unavailable|not on the ledger/i.test(message)
}

export function createOutbox(storage: OutboxStorage, namespace = OUTBOX_KEY) {
  const listeners = new Set<() => void>()

  const prefix = `${namespace}.op.`
  function notify() { for (const listener of listeners) listener() }
  function all(): OutboxOp[] {
    // A key per operation prevents one tab or an in-flight drain from replacing
    // another operation. The old aggregate is retained until safely migrated.
    const ops = readOps({ getItem: () => storage.getItem(namespace), setItem: storage.setItem })
    for (let i = 0; i < (storage.length ?? 0); i++) {
      const key = storage.key?.(i)
      if (!key?.startsWith(prefix)) continue
      try { const op = JSON.parse(storage.getItem(key) ?? "null") as OutboxOp; if (op?.opId && op.groupId) ops.push(op) } catch { /* leave corrupt records recoverable */ }
    }
    return [...new Map(ops.map((op) => [op.opId, op])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  function put(op: OutboxOp) {
    if (!storage.key) throw new Error("Offline storage does not support durable operations.")
    storage.setItem(prefix + op.opId, JSON.stringify(op))
    notify()
  }
  function remove(opId: string) {
    storage.removeItem?.(prefix + opId)
    const legacy = readOps({ getItem: () => storage.getItem(namespace), setItem: storage.setItem })
    if (legacy.some((op) => op.opId === opId)) storage.setItem(namespace, JSON.stringify(legacy.filter((op) => op.opId !== opId)))
    notify()
  }
  function list() { return all().filter((op) => !op.failedError) }

  return {
    list,
    pendingCount(groupId?: string) {
      const ops = list()
      if (!groupId) return ops.length
      return ops.filter((item) => item.groupId === groupId).length
    },
    enqueue(op: OutboxOp) {
      const ops = list()
      if (ops.some((item) => item.opId === op.opId)) return ops
      put(op)
      return list()
    },
    clear() {
      for (const op of all()) remove(op.opId)
    },
    failed() { return all().filter((op) => Boolean(op.failedError)) },
    retryFailed() { for (const op of all()) if (op.failedError) put({ ...op, failedError: undefined }) },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async drain(hooks: DrainHooks): Promise<DrainResult> {
      if (!hooks.isOnline()) {
        return { sent: 0, remaining: list().length, paused: true, dropped: 0, droppedError: undefined }
      }
      let sent = 0
      let dropped = 0
      let droppedError: unknown
      while (true) {
        const ops = list()
        const head = ops[0]
        if (!head) return { sent, remaining: 0, paused: false, dropped, droppedError }
        try {
          if (!hooks.isOnline()) return { sent, remaining: list().length, paused: true, dropped, droppedError }
          const result = await hooks.send(head)
          remove(head.opId)
          sent += 1
          hooks.onSent?.(head, result)
        } catch (error) {
          if (hooks.isRetryable?.(error) ?? isRetryableSyncError(error)) {
            return { sent, remaining: list().length, paused: true, dropped, error, droppedError }
          }
          remove(head.opId)
          put({ ...head, failedError: error instanceof Error ? error.message : "Could not save this edit." })
          dropped += 1
          droppedError = error
        }
      }
    },
  }
}

export type Outbox = ReturnType<typeof createOutbox>

const singletons = new Map<string, Outbox>()

export function browserOutbox(profileId?: string): Outbox {
  const storage = typeof window !== "undefined" ? window.localStorage : memoryStorage()
  let owner = profileId
  if (!owner) {
    try { owner = JSON.parse(storage.getItem("waybill.profile") ?? "null")?.id } catch { /* no session */ }
  }
  const namespace = `${OUTBOX_KEY}:${owner || "signed-out"}`
  let box = singletons.get(namespace)
  if (!box) {
    box = createOutbox(storage, namespace); singletons.set(namespace, box)
    if (owner) {
      const legacy = readOps(storage)
      const owned = legacy.filter((op) => (op.profileId ?? op.body.profileId) === owner)
      for (const op of owned) box.enqueue({ ...op, profileId: owner })
      if (owned.length) storage.setItem(OUTBOX_KEY, JSON.stringify(legacy.filter((op) => !owned.some((old) => old.opId === op.opId))))
    }
  }
  return box
}
