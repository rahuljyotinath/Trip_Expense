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

/** Solo self-pay only — for a member's personal expenditure total (not group trip spend). */
export function personalExpenditureForMember(group: Group, memberId: string): number {
  return ledgerPersonalExpenses(group)
    .filter((expense) => expense.paidByMemberId === memberId)
    .reduce((sum, expense) => sum + expense.amount, 0)
}
