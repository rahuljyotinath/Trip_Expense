"use client"

import { useMemo } from "react"
import { formatMoney } from "@/lib/money"
import type { ExpensesByDay } from "@/lib/ledger-display"
import { groupPaidByMember } from "@/lib/ledger-display"
import type { Group } from "@/lib/types"

function formatDayDots(isoDate: string) {
  const [y, m, d] = isoDate.split("-")
  return `${d}.${m}.${y}`
}

export function LedgerSpendChart({
  group,
  ledgerByDay,
  memberLabel,
}: {
  group: Group
  ledgerByDay: ExpensesByDay[]
  memberLabel: (memberId: string) => string
}) {
  const paidByMember = useMemo(() => groupPaidByMember(group), [group])
  const maxPaid = paidByMember[0]?.amount ?? 0
  const maxDay = useMemo(
    () => Math.max(0, ...ledgerByDay.map((day) => day.total)),
    [ledgerByDay]
  )

  if (paidByMember.length === 0 && ledgerByDay.length === 0) return null

  return (
    <div className="space-y-4 rounded-xl border bg-card/50 p-4">
      {paidByMember.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Who paid (group)
          </p>
          <ul className="space-y-2.5">
            {paidByMember.map((row) => (
              <li key={row.memberId} className="grid grid-cols-[minmax(0,6rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate font-medium">{memberLabel(row.memberId)}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{
                      width: maxPaid > 0 ? `${(row.amount / maxPaid) * 100}%` : "0%",
                    }}
                  />
                </div>
                <span className="min-w-[4.5rem] text-right tabular-nums text-muted-foreground">
                  {formatMoney(row.amount, group.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {ledgerByDay.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Spend by day
          </p>
          <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
            {ledgerByDay.map((day) => {
              const heightPct = maxDay > 0 ? (day.total / maxDay) * 100 : 0
              return (
                <button
                  key={day.date}
                  type="button"
                  className="flex min-w-[2.75rem] flex-col items-center gap-1 rounded-md px-1 py-1 text-center transition-colors hover:bg-muted/60"
                  title={`${formatDayDots(day.date)} · ${formatMoney(day.total, group.currency)}`}
                  onClick={() => {
                    document
                      .getElementById(`ledger-day-${day.date}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }}
                >
                  <span className="flex h-16 w-full items-end justify-center">
                    <span
                      className="w-full max-w-[2rem] rounded-t-sm bg-primary/50"
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    />
                  </span>
                  <span className="text-[10px] leading-tight text-muted-foreground tabular-nums">
                    {formatDayDots(day.date)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
