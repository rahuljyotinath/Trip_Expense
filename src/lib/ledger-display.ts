import { fromPaise, toPaise } from "./money"
import { expenseShareCutsPaise } from "./settle"
import { memberName } from "./trip-member"
import type { Expense, Group, Payment } from "./types"

export function compareLedgerExpenses(a: Expense, b: Expense) {
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  return a.createdAt.localeCompare(b.createdAt)
}

function comparePayments(a: Payment, b: Payment) {
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  return a.createdAt.localeCompare(b.createdAt)
}

export function activeExpenses(group: Group): Expense[] {
  return group.expenses.filter((item) => !item.voidedAt).sort(compareLedgerExpenses)
}

/** Single participant who also paid — personal, not a shared group bill. */
export function isSoloSelfExpense(expense: Expense) {
  return (
    expense.participantIds.length === 1 &&
    expense.participantIds[0] === expense.paidByMemberId
  )
}

export function ledgerGroupExpenses(group: Group): Expense[] {
  return activeExpenses(group).filter((expense) => !isSoloSelfExpense(expense))
}

export function ledgerPersonalExpenses(group: Group): Expense[] {
  return activeExpenses(group).filter((expense) => isSoloSelfExpense(expense))
}

export function ledgerPersonalPayments(group: Group): Payment[] {
  return (group.payments ?? []).filter((item) => !item.voidedAt).sort(comparePayments)
}

export function ledgerPersonalExpensesForViewer(
  group: Group,
  viewerMemberId: string | null
): Expense[] {
  if (!viewerMemberId) return []
  return ledgerPersonalExpenses(group).filter(
    (expense) => expense.paidByMemberId === viewerMemberId
  )
}

export function ledgerPersonalPaymentsForViewer(
  group: Group,
  viewerMemberId: string | null
): Payment[] {
  if (!viewerMemberId) return []
  return ledgerPersonalPayments(group).filter(
    (payment) =>
      payment.fromMemberId === viewerMemberId || payment.toMemberId === viewerMemberId
  )
}

export type ExpensesByDay = {
  date: string
  expenses: Expense[]
  total: number
}

export function expensesByDay(expenses: Expense[]): ExpensesByDay[] {
  const days: { date: string; expenses: Expense[] }[] = []
  for (const expense of expenses) {
    const last = days[days.length - 1]
    if (last?.date === expense.date) last.expenses.push(expense)
    else days.push({ date: expense.date, expenses: [expense] })
  }
  return days.map((day) => ({
    ...day,
    total: day.expenses.reduce((sum, item) => sum + item.amount, 0),
  }))
}

export type LedgerDayForViewer = {
  date: string
  expenses: Expense[]
  payments: Payment[]
  groupSpendTotal: number
}

export function ledgerDaysForViewer(
  group: Group,
  viewerMemberId: string | null
): LedgerDayForViewer[] {
  const expenseDays = expensesByDay(ledgerGroupExpenses(group))
  const tripPayments = ledgerPersonalPayments(group)

  const byDate = new Map<string, { expenses: Expense[]; payments: Payment[] }>()
  for (const day of expenseDays) {
    byDate.set(day.date, { expenses: day.expenses, payments: [] })
  }
  for (const payment of tripPayments) {
    const bucket = byDate.get(payment.date) ?? { expenses: [], payments: [] }
    bucket.payments.push(payment)
    byDate.set(payment.date, bucket)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { expenses, payments }]) => ({
      date,
      expenses,
      payments: payments.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      groupSpendTotal: expenses.reduce((sum, item) => sum + item.amount, 0),
    }))
}

export type MemberPaidTotal = {
  memberId: string
  amount: number
}

/** Group ledger spends aggregated by who paid (excludes personal solo-self). */
export function groupPaidByMember(group: Group): MemberPaidTotal[] {
  const totals = new Map<string, number>()
  for (const expense of ledgerGroupExpenses(group)) {
    totals.set(
      expense.paidByMemberId,
      (totals.get(expense.paidByMemberId) ?? 0) + expense.amount
    )
  }
  return [...totals.entries()]
    .map(([memberId, amount]) => ({ memberId, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export type MemberPaidBackReceived = {
  memberId: string
  amount: number
}

/** Paid-back cash received per member (all non-void payments). */
export function groupPaidBackReceivedByMember(group: Group): MemberPaidBackReceived[] {
  const totals = new Map<string, number>()
  for (const payment of ledgerPersonalPayments(group)) {
    totals.set(
      payment.toMemberId,
      (totals.get(payment.toMemberId) ?? 0) + payment.amount
    )
  }
  return [...totals.entries()]
    .map(([memberId, amount]) => ({ memberId, amount }))
    .sort((a, b) => b.amount - a.amount)
}

/** Paid-back cash sent per member (all non-void payments). */
export function groupPaidBackSentByMember(group: Group): MemberPaidBackReceived[] {
  const totals = new Map<string, number>()
  for (const payment of ledgerPersonalPayments(group)) {
    totals.set(
      payment.fromMemberId,
      (totals.get(payment.fromMemberId) ?? 0) + payment.amount
    )
  }
  return [...totals.entries()]
    .map(([memberId, amount]) => ({ memberId, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export function paidBackReceivedForMember(group: Group, memberId: string): number {
  return groupPaidBackReceivedByMember(group).find((row) => row.memberId === memberId)?.amount ?? 0
}

export type MemberPaidAndReceived = {
  memberId: string
  paid: number
  received: number
}

export function groupMemberPaidAndReceived(group: Group): MemberPaidAndReceived[] {
  const paidMap = new Map(groupPaidByMember(group).map((row) => [row.memberId, row.amount]))
  for (const { memberId, amount } of groupPaidBackSentByMember(group)) {
    paidMap.set(memberId, (paidMap.get(memberId) ?? 0) + amount)
  }
  const receivedMap = new Map(
    groupPaidBackReceivedByMember(group).map((row) => [row.memberId, row.amount])
  )
  const ids = new Set([...paidMap.keys(), ...receivedMap.keys()])
  return [...ids]
    .map((memberId) => ({
      memberId,
      paid: paidMap.get(memberId) ?? 0,
      received: receivedMap.get(memberId) ?? 0,
    }))
    .sort((a, b) => b.paid + b.received - (a.paid + a.received))
}

/** Solo self-pay only — for a member's personal expenditure total (not group trip spend). */
export function personalExpenditureForMember(group: Group, memberId: string): number {
  return ledgerPersonalExpenses(group)
    .filter((expense) => expense.paidByMemberId === memberId)
    .reduce((sum, expense) => sum + expense.amount, 0)
}

export type ViewerSecondAmount =
  | { kind: "lent"; amount: number }
  | { kind: "owe"; amount: number }
  | { kind: "none" }

/** Viewer-relative second amount for a group ledger row. Reuses expenseShareCutsPaise. */
export function expenseViewerSecondAmount(
  expense: Expense,
  viewerMemberId: string | null,
  memberIds: Iterable<string>
): ViewerSecondAmount {
  if (!viewerMemberId) return { kind: "none" }
  const cuts = expenseShareCutsPaise(expense, memberIds)
  if (!cuts) return { kind: "none" }
  const sharePaise = cuts.get(viewerMemberId) ?? 0
  const viewerPaid = expense.paidByMemberId === viewerMemberId
  if (viewerPaid) {
    const lentPaise = toPaise(expense.amount) - sharePaise
    if (lentPaise <= 0) return { kind: "none" }
    return { kind: "lent", amount: fromPaise(lentPaise) }
  }
  if (expense.participantIds.includes(viewerMemberId)) {
    if (sharePaise <= 0) return { kind: "none" }
    return { kind: "owe", amount: fromPaise(sharePaise) }
  }
  return { kind: "none" }
}

export type PaidBackViewerTone = "received" | "paid-back" | "none"

export function paymentViewerTone(
  payment: Payment,
  viewerMemberId: string | null
): PaidBackViewerTone {
  if (!viewerMemberId) return "none"
  if (payment.toMemberId === viewerMemberId) return "received"
  if (payment.fromMemberId === viewerMemberId) return "paid-back"
  return "none"
}

export type LedgerDayItem =
  | { kind: "expense"; createdAt: string; expense: Expense }
  | { kind: "payment"; createdAt: string; payment: Payment }

function buildLedgerDayItemMap(day: LedgerDayForViewer) {
  const byId = new Map<string, LedgerDayItem>()
  for (const expense of day.expenses) {
    byId.set(expense.id, {
      kind: "expense",
      createdAt: expense.createdAt,
      expense,
    })
  }
  for (const payment of day.payments) {
    byId.set(payment.id, {
      kind: "payment",
      createdAt: payment.createdAt,
      payment,
    })
  }
  return byId
}

export function ledgerDayItemsChronological(day: LedgerDayForViewer): LedgerDayItem[] {
  const items = [...buildLedgerDayItemMap(day).values()]
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return items
}

export function ledgerDayItems(
  day: LedgerDayForViewer,
  ledgerDayOrder?: Record<string, string[]>
): LedgerDayItem[] {
  const byId = buildLedgerDayItemMap(day)
  const chronological = [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  )
  const order = ledgerDayOrder?.[day.date]
  if (!order?.length) return chronological

  const seen = new Set<string>()
  const result: LedgerDayItem[] = []
  for (const id of order) {
    const item = byId.get(id)
    if (item) {
      result.push(item)
      seen.add(id)
    }
  }
  for (const item of chronological) {
    const id = item.kind === "expense" ? item.expense.id : item.payment.id
    if (!seen.has(id)) result.push(item)
  }
  return result
}

export type ExpenseRowMeta = {
  paidByLabel: string
  sharedWith: string
}

/** Payer and split roster for a group ledger expense row. */
export function expenseRowMetaParts(
  group: Group,
  expense: Expense,
  viewerMemberId?: string | null
): ExpenseRowMeta {
  const paidByLabel =
    viewerMemberId && expense.paidByMemberId === viewerMemberId
      ? "You"
      : memberName(group, expense.paidByMemberId)
  const withNames = expense.participantIds.map((id) =>
    viewerMemberId && id === viewerMemberId ? "you" : memberName(group, id)
  )
  const uniqueWith = [...new Set(withNames)]
  return { paidByLabel, sharedWith: uniqueWith.join(", ") }
}

/** Single-line meta (tests and exports). */
export function expenseRowMeta(
  group: Group,
  expense: Expense,
  viewerMemberId?: string | null
): string {
  const { paidByLabel, sharedWith } = expenseRowMetaParts(
    group,
    expense,
    viewerMemberId
  )
  return `Paid by ${paidByLabel} · Shared by ${sharedWith}`
}
