"use client"

import Link from "next/link"
import { useMemo } from "react"
import { formatMoney } from "@/lib/money"
import type { ExpensesByDay } from "@/lib/ledger-display"
import { groupMemberPaidAndReceived } from "@/lib/ledger-display"
import type { Group } from "@/lib/types"

function formatDayDots(isoDate: string) {
  const [y, m, d] = isoDate.split("-")
  return `${d}.${m}.${y}`
}

function formatPaidReceived(
  paid: number,
  received: number,
  currency: string
) {
  const parts: string[] = []
  if (paid > 0) parts.push(`Paid ${formatMoney(paid, currency)}`)
  if (received > 0) parts.push(`Received ${formatMoney(received, currency)}`)
  if (parts.length === 0) return "—"
  return parts.join(" · ")
}

export function LedgerSpendChart({
  group,
  ledgerByDay,
  memberLabel,
  tripPath,
}: {
  group: Group
  ledgerByDay: ExpensesByDay[]
  memberLabel: (memberId: string) => string
  tripPath?: string
}) {
  const memberFlow = useMemo(() => groupMemberPaidAndReceived(group), [group])
  const maxPaid = useMemo(
    () => Math.max(0, ...memberFlow.map((row) => row.paid)),
    [memberFlow]
  )
  const maxReceived = useMemo(
    () => Math.max(0, ...memberFlow.map((row) => row.received)),
    [memberFlow]
  )
  const flowScaleMax = useMemo(
    () => Math.max(maxPaid, maxReceived, 0),
    [maxPaid, maxReceived]
  )
  const maxDay = useMemo(
    () => Math.max(0, ...ledgerByDay.map((day) => day.total)),
    [ledgerByDay]
  )

  const showMemberFlow = memberFlow.some((row) => row.paid > 0 || row.received > 0)

  if (!showMemberFlow && ledgerByDay.length === 0) return null

  return (
    <div className="space-y-4 rounded-xl border bg-card/50 p-4">
      {showMemberFlow ? (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Who paid &amp; received (group)
          </p>
          <p className="text-[11px] text-muted-foreground">
            Paid includes group bills you fronted plus paid-back you sent. Bar length
            uses the same scale for Paid and Received.
          </p>
          <ul className="space-y-3">
            {memberFlow.map((row) => (
              <li key={row.memberId} className="space-y-1.5 text-sm">
                <div className="grid grid-cols-[minmax(0,6rem)_1fr_auto] items-center gap-3">
                  <span className="truncate font-medium">{memberLabel(row.memberId)}</span>
                  <div className="space-y-1">
                    <div className="grid grid-cols-[2.5rem_1fr] items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase">Paid</span>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{
                            width:
                              flowScaleMax > 0 && row.paid > 0
                                ? `${(row.paid / flowScaleMax) * 100}%`
                                : "0%",
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-[2.5rem_1fr] items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase">Rcvd</span>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-moss/70"
                          style={{
                            width:
                              flowScaleMax > 0 && row.received > 0
                                ? `${(row.received / flowScaleMax) * 100}%`
                                : "0%",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <span className="max-w-[11rem] text-right text-xs leading-snug tabular-nums text-muted-foreground">
                    {formatPaidReceived(row.paid, row.received, group.currency)}
                  </span>
                </div>
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
              const title = `${formatDayDots(day.date)} · ${formatMoney(day.total, group.currency)}`
              const inner = (
                <>
                  <span className="flex h-16 w-full items-end justify-center">
                    <span
                      className="w-full max-w-[2rem] rounded-t-sm bg-primary/50"
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    />
                  </span>
                  <span className="text-[10px] leading-tight text-muted-foreground tabular-nums">
                    {formatDayDots(day.date)}
                  </span>
                </>
              )
              const className =
                "flex min-w-[2.75rem] flex-col items-center gap-1 rounded-md px-1 py-1 text-center transition-colors hover:bg-muted/60"
              if (tripPath) {
                return (
                  <Link
                    key={day.date}
                    href={`${tripPath}#ledger-day-${day.date}`}
                    className={className}
                    title={title}
                  >
                    {inner}
                  </Link>
                )
              }
              return (
                <button
                  key={day.date}
                  type="button"
                  className={className}
                  title={title}
                  onClick={() => {
                    document
                      .getElementById(`ledger-day-${day.date}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }}
                >
                  {inner}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
