import { uid } from "@/lib/ids"

export const OUTBOX_KEY = "waybill.outbox"

export type OutboxOp = {
  opId: string
  groupId: string
  body: Record<string, unknown>
  createdAt: string
}

export type OutboxStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
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
  const message = error instanceof Error ? error.message : String(error)
  if (/unconfigured/i.test(message)) return true
  if (/sign in again|profile not found|forbidden|version conflict|not on the ledger/i.test(message)) {
    return false
  }
  return false
}

export function createOutbox(storage: OutboxStorage) {
  const listeners = new Set<() => void>()

  function write(ops: OutboxOp[]) {
    storage.setItem(OUTBOX_KEY, JSON.stringify(ops))
    for (const listener of listeners) listener()
  }

  function list() {
    return readOps(storage)
  }

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
      const next = [...ops, op]
      write(next)
      return next
    },
    clear() {
      write([])
    },
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
          const result = await hooks.send(head)
          write(ops.slice(1))
          sent += 1
          hooks.onSent?.(head, result)
        } catch (error) {
          if (hooks.isRetryable?.(error) ?? isRetryableSyncError(error)) {
            return { sent, remaining: list().length, paused: true, dropped, error, droppedError }
          }
          write(ops.slice(1))
          dropped += 1
          droppedError = error
        }
      }
    },
  }
}

export type Outbox = ReturnType<typeof createOutbox>

let singleton: Outbox | null = null

export function browserOutbox(): Outbox {
  if (!singleton) {
    const storage =
      typeof window !== "undefined" ? window.localStorage : memoryStorage()
    singleton = createOutbox(storage)
  }
  return singleton
}
