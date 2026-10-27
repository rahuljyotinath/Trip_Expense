"use client"

import Link from "next/link"
import { useMemo } from "react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LedgerSpendChart } from "@/components/trip/ledger-spend-chart"
import {
  expensesByDay,
  groupMemberPaidAndReceived,
  ledgerGroupExpenses,
} from "@/lib/ledger-display"
import { formatMoney } from "@/lib/money"
import { memberName } from "@/lib/trip-member"
import { tripStats } from "@/lib/stats"
import type { Group } from "@/lib/types"
import { formatTripDates } from "@/components/waybill-app"

export function TripAnalytics({
  group,
  tripPath,
}: {
  group: Group
  tripPath: string
}) {
  const stats = useMemo(() => tripStats(group), [group])
  const ledgerByDay = useMemo(
    () => expensesByDay(ledgerGroupExpenses(group)),
    [group]
  )
  const memberFlow = useMemo(() => groupMemberPaidAndReceived(group), [group])
  const flowByMember = useMemo(
    () => new Map(memberFlow.map((row) => [row.memberId, row])),
    [memberFlow]
  )
  const groupExpenses = useMemo(() => ledgerGroupExpenses(group), [group])
  const paymentCount = (group.payments ?? []).filter((p) => !p.voidedAt).length
  const tripDates = formatTripDates(group)
  const showChart =
    groupExpenses.length > 0 || (group.payments ?? []).some((item) => !item.voidedAt)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl tracking-tight">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            {group.name}
            {tripDates ? ` · ${tripDates}` : ""}
          </p>
        </div>
        <Link
          href={tripPath}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium shadow-sm hover:bg-muted"
        >
          Back to trip
        </Link>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-6">
        {showChart ? (
          <LedgerSpendChart
            group={group}
            ledgerByDay={ledgerByDay}
            memberLabel={(id) => memberName(group, id)}
            tripPath={tripPath}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No data yet</CardTitle>
              <CardDescription>
                Log group spends or mark paid back on the trip ledger to see charts here.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-card/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Trip spend
            </p>
            <p className="font-heading text-lg tabular-nums">
              {formatMoney(stats.totalSpend, group.currency)}
            </p>
          </div>
          <div className="rounded-xl border bg-card/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Group spends
            </p>
            <p className="font-heading text-lg tabular-nums">{groupExpenses.length}</p>
          </div>
          <div className="rounded-xl border bg-card/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Paid back
            </p>
            <p className="font-heading text-lg tabular-nums">{paymentCount}</p>
          </div>
          <div className="rounded-xl border bg-card/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              People
            </p>
            <p className="font-heading text-lg tabular-nums">{group.members.length}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 text-right font-medium">Share</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Received</th>
                <th className="px-3 py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {group.members.map((member) => {
                const mine = stats.byMember[member.id]
                const flow = flowByMember.get(member.id)
                const net = mine?.net ?? 0
                return (
                  <tr key={member.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{member.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(mine?.share ?? 0, group.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(flow?.paid ?? 0, group.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(flow?.received ?? 0, group.currency)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${net >= 0 ? "text-moss" : "text-stamp"}`}
                    >
                      {formatMoney(net, group.currency)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
