"use client"

import type { ExpenseRowMeta } from "@/lib/ledger-display"
import { formatPaidBackRowTitle } from "@/lib/ledger-display"
import type { Group, Payment } from "@/lib/types"

/** Mobile: title then paid-by. Desktop (sm+): same row. */
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
  const paidBy = (
    <span className="font-semibold text-foreground/85">
      Paid by {rowMeta.paidByLabel}
    </span>
  )
  return (
    <div
      className={`min-w-0 text-sm max-sm:space-y-0.5 sm:flex sm:min-w-0 sm:items-baseline sm:gap-2 ${className}`}
    >
      <p className="min-w-0 font-medium leading-snug break-words [overflow-wrap:anywhere] sm:truncate">
        {title}
      </p>
      <p className="text-xs text-muted-foreground max-sm:mt-0 sm:shrink-0 sm:truncate">
        <span className="hidden text-muted-foreground/70 sm:inline" aria-hidden>
          ·{" "}
        </span>
        {paidBy}
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
