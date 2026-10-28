"use client"

import type { ExpenseRowMeta } from "@/lib/ledger-display"
import { formatPaidBackRowTitle } from "@/lib/ledger-display"
import type { Group, Payment } from "@/lib/types"

/** Reason on its own line (wraps on narrow screens); paid-by below. */
export function LedgerExpenseHeadline({
  reason,
  rowMeta,
  className = "",
}: {
  reason: string
  rowMeta: ExpenseRowMeta
  className?: string
}) {
  const title = reason.trim() || "—"
  return (
    <div className={`min-w-0 text-sm ${className}`}>
      <p className="font-medium leading-snug break-words [overflow-wrap:anywhere]">
        {title}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground sm:truncate">
        <span className="font-semibold text-foreground/85">
          Paid by {rowMeta.paidByLabel}
        </span>
      </p>
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
    <p className="min-w-0 text-sm font-medium leading-snug break-words [overflow-wrap:anywhere] sm:truncate">
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
