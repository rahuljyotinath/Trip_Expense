"use client"

import type { ExpenseRowMeta } from "@/lib/ledger-display"
import { formatPaidBackRowTitle } from "@/lib/ledger-display"
import type { Group, Payment } from "@/lib/types"

/** Title and paid-by adjacent on one line; shared-by on the next. */
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
    <p className={`min-w-0 truncate text-sm ${className}`}>
      <span className="font-medium">{reason}</span>
      <span className="text-muted-foreground"> · </span>
      <span className="whitespace-nowrap font-semibold">
        Paid by {rowMeta.paidByLabel}
      </span>
    </p>
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
      {formatPaidBackRowTitle(group, payment, viewerMemberId)}
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
    <p className={`min-w-0 flex-1 truncate ${crossed ? "text-muted-foreground line-through" : ""}`}>
      {dateLabel} · {formatPaidBackRowTitle(group, payment, viewerMemberId)}
    </p>
  )
}
