"use client"

import type { ExpenseRowMeta } from "@/lib/ledger-display"
import { formatPaidBackRowPrimary } from "@/lib/ledger-display"
import type { Group, Payment } from "@/lib/types"

/** Title + paid-by on one line; shared-by on the next (grid, no wrap). */
export function LedgerExpenseHeadline({
  reason,
  rowMeta,
  className = "",
}: {
  reason: string
  rowMeta: ExpenseRowMeta
  className?: string
}) {
  return (
    <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 ${className}`}>
      <span className="truncate text-sm font-medium">{reason}</span>
      <span className="whitespace-nowrap text-sm font-semibold">
        Paid by {rowMeta.paidByLabel}
      </span>
    </div>
  )
}

export function LedgerPaidBackHeadline({
  group,
  payment,
  viewerMemberId,
}: {
  group: Group
  payment: Payment
  viewerMemberId: string | null
}) {
  return (
    <p className="min-w-0 truncate text-sm font-medium">
      {formatPaidBackRowPrimary(group, payment, viewerMemberId, group.currency)}
    </p>
  )
}

export function SettlePaidBackLine({
  group,
  payment,
  viewerMemberId,
  dateLabel,
  crossed,
}: {
  group: Group
  payment: Payment
  viewerMemberId: string | null
  dateLabel: string
  crossed?: boolean
}) {
  return (
    <p className={crossed ? "text-muted-foreground line-through" : ""}>
      {dateLabel} ·{" "}
      {formatPaidBackRowPrimary(group, payment, viewerMemberId, group.currency)}
    </p>
  )
}
