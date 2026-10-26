import { fromPaise, toPaise } from "@/lib/money"
import { allocatePercent } from "@/lib/shares"
import { normalizeGroup, type Expense, type Group, type Transfer } from "@/lib/types"

function equalShareCutsPaise(total: number, people: string[]) {
  const cuts = new Map<string, number>()
  const share = Math.floor(total / people.length)
  let remainder = total - share * people.length
  for (const id of people) {
    let cut = share
    if (remainder > 0) {
      cut += 1
      remainder -= 1
    }
    cuts.set(id, cut)
  }
  return cuts
}

/** Each participant's share of one expense, in paise. Skips voided / invalid rows. */
export function expenseShareCutsPaise(expense: Expense, memberIds: Iterable<string>) {
  if (expense.voidedAt) return null
  const valid = new Set(memberIds)
  const people = expense.participantIds.filter((id) => valid.has(id))
  if (people.length === 0) return null
  const total = toPaise(expense.amount)
  if (expense.split === "percent") {
    return allocatePercent(total, people, expense.shares)
  }
  return equalShareCutsPaise(total, people)
}

export function netBalances(raw: Group) {
  const group = normalizeGroup(raw)
  const balances = new Map<string, number>()
  for (const member of group.members) {
    balances.set(member.id, 0)
  }

  for (const expense of group.expenses) {
    const cuts = expenseShareCutsPaise(
      expense,
      group.members.map((member) => member.id)
    )
    if (!cuts) continue
    const total = toPaise(expense.amount)
    const payer = balances.get(expense.paidByMemberId)
    if (payer === undefined) continue
    balances.set(expense.paidByMemberId, payer + total)
    for (const [id, cut] of cuts) {
      balances.set(id, (balances.get(id) ?? 0) - cut)
    }
  }

  for (const payment of group.payments) {
    if (payment.voidedAt) continue
    if (!balances.has(payment.fromMemberId) || !balances.has(payment.toMemberId)) {
      continue
    }
    const amount = toPaise(payment.amount)
    balances.set(
      payment.fromMemberId,
      (balances.get(payment.fromMemberId) ?? 0) + amount
    )
    balances.set(
      payment.toMemberId,
      (balances.get(payment.toMemberId) ?? 0) - amount
    )
  }

  const result: Record<string, number> = {}
  for (const [id, paise] of balances) {
    result[id] = fromPaise(paise)
  }
  return result
}

export function simplifyDebts(group: Group): Transfer[] {
  const balances = netBalances(group)
  const debtors: { id: string; amount: number }[] = []
  const creditors: { id: string; amount: number }[] = []

  for (const [id, amount] of Object.entries(balances)) {
    const paise = toPaise(amount)
    if (paise < -1) debtors.push({ id, amount: -paise })
    if (paise > 1) creditors.push({ id, amount: paise })
  }

  debtors.sort((a, b) => b.amount - a.amount)
  creditors.sort((a, b) => b.amount - a.amount)

  const transfers: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount)
    if (pay > 0) {
      transfers.push({
        fromMemberId: debtors[i].id,
        toMemberId: creditors[j].id,
        amount: fromPaise(pay),
      })
    }
    debtors[i].amount -= pay
    creditors[j].amount -= pay
    if (debtors[i].amount <= 1) i += 1
    if (creditors[j].amount <= 1) j += 1
  }
  return transfers
}
