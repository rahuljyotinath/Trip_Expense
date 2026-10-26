import { fromPaise, toPaise } from "@/lib/money"
import { expenseShareCutsPaise, netBalances } from "@/lib/settle"
import { normalizeGroup, type Group } from "@/lib/types"

export type MemberTripStats = {
  share: number
  paid: number
  net: number
}

export type TripStats = {
  totalSpend: number
  byMember: Record<string, MemberTripStats>
}

export function tripStats(raw: Group): TripStats {
  const group = normalizeGroup(raw)
  const nets = netBalances(group)
  const sharePaise: Record<string, number> = {}
  const paidPaise: Record<string, number> = {}
  for (const member of group.members) {
    sharePaise[member.id] = 0
    paidPaise[member.id] = 0
  }

  let totalSpendPaise = 0
  for (const expense of group.expenses) {
    if (expense.voidedAt) continue
    totalSpendPaise += toPaise(expense.amount)
    const cuts = expenseShareCutsPaise(
      expense,
      group.members.map((member) => member.id)
    )
    if (!cuts) continue
    if (paidPaise[expense.paidByMemberId] !== undefined) {
      paidPaise[expense.paidByMemberId] += toPaise(expense.amount)
    }
    for (const [id, cut] of cuts) {
      if (sharePaise[id] !== undefined) sharePaise[id] += cut
    }
  }

  const byMember: Record<string, MemberTripStats> = {}
  for (const member of group.members) {
    byMember[member.id] = {
      share: fromPaise(sharePaise[member.id] ?? 0),
      paid: fromPaise(paidPaise[member.id] ?? 0),
      net: nets[member.id] ?? 0,
    }
  }

  return {
    totalSpend: fromPaise(totalSpendPaise),
    byMember,
  }
}
