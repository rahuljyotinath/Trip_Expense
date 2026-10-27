import type { LedgerDayForViewer } from "./ledger-display"
import type { Group } from "./types"

function chronologicalDayIds(day: LedgerDayForViewer): string[] {
  const rows = [
    ...day.expenses.map((expense) => ({
      id: expense.id,
      createdAt: expense.createdAt,
    })),
    ...day.payments.map((payment) => ({
      id: payment.id,
      createdAt: payment.createdAt,
    })),
  ]
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return rows.map((row) => row.id)
}

export function ledgerDayItemId(day: LedgerDayForViewer, id: string): boolean {
  if (day.expenses.some((item) => item.id === id)) return true
  return day.payments.some((item) => item.id === id)
}

export function expectedLedgerDayIds(day: LedgerDayForViewer): string[] {
  return chronologicalDayIds(day)
}

export function appendLedgerDayOrder(group: Group, date: string, id: string): Group {
  const map = { ...(group.ledgerDayOrder ?? {}) }
  const list = map[date]
  if (!list) return group
  if (list.includes(id)) return group
  map[date] = [...list, id]
  return { ...group, ledgerDayOrder: map }
}

export function removeIdFromLedgerDayOrder(group: Group, id: string): Group {
  const raw = group.ledgerDayOrder
  if (!raw) return group
  let changed = false
  const map: Record<string, string[]> = {}
  for (const [date, ids] of Object.entries(raw)) {
    const next = ids.filter((item) => item !== id)
    if (next.length !== ids.length) changed = true
    if (next.length > 0) map[date] = next
  }
  if (!changed) return group
  return { ...group, ledgerDayOrder: Object.keys(map).length > 0 ? map : undefined }
}

export function moveIdBetweenLedgerDays(
  group: Group,
  id: string,
  fromDate: string,
  toDate: string
): Group {
  if (fromDate === toDate) return group
  let next = removeIdFromLedgerDayOrder(group, id)
  next = appendLedgerDayOrder(next, toDate, id)
  return next
}

export function setLedgerDayOrder(
  group: Group,
  date: string,
  orderedIds: string[]
): Group {
  const map = { ...(group.ledgerDayOrder ?? {}) }
  map[date] = orderedIds
  return { ...group, ledgerDayOrder: map }
}
