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
  const viewerPayments = ledgerPersonalPaymentsForViewer(group, viewerMemberId)

  const byDate = new Map<string, { expenses: Expense[]; payments: Payment[] }>()
  for (const day of expenseDays) {
    byDate.set(day.date, { expenses: day.expenses, payments: [] })
  }
  for (const payment of viewerPayments) {
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
