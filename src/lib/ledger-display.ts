import type { Expense, Group } from "./types"

export function compareLedgerExpenses(a: Expense, b: Expense) {
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  return a.createdAt.localeCompare(b.createdAt)
}

/** Single participant who also paid — personal note, not a shared bill. */
export function isSoloSelfExpense(expense: Expense) {
  return (
    expense.participantIds.length === 1 &&
    expense.participantIds[0] === expense.paidByMemberId
  )
}

export function expenseTouchesUnclaimedMember(group: Group, expense: Expense) {
  return expense.participantIds.some((id) => {
    const member = group.members.find((item) => item.id === id)
    return !member?.profileId
  })
}

/** Ledger tab: shared bills you're on; hide solo-self, unclaimed rosters, others' private splits. */
export function ledgerExpensesForDisplay(
  group: Group,
  viewerMemberId: string | null
): Expense[] {
  return group.expenses
    .filter((item) => !item.voidedAt)
    .filter((expense) => {
      if (isSoloSelfExpense(expense)) return false
      if (expenseTouchesUnclaimedMember(group, expense)) return false
      if (viewerMemberId && !expense.participantIds.includes(viewerMemberId)) {
        return false
      }
      return true
    })
    .sort(compareLedgerExpenses)
}
