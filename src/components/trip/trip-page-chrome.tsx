"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Banknote,
  Check,
  Download,
  Link2,
  Receipt,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTripDates } from "@/components/trip/trip-format"
import { tripDeskScrollClass } from "@/components/trip/trip-desk-layout"
import {
  drainGroupOutbox,
  outboxPendingCount,
  subscribeOutbox,
} from "@/lib/client-api"
import {
  groupPaidByMember,
  paidBackReceivedForMember,
  personalExpenditureForMember,
} from "@/lib/ledger-display"
import { formatMoney } from "@/lib/money"
import { tripStats } from "@/lib/stats"
import { downloadTripCsvFile, parseTripCsv } from "@/lib/trip-csv"
import type { Group, PublicProfile } from "@/lib/types"

export type TripTabId = "settle" | "ledger" | "people" | "analytics" | "settings"

function TripSyncBanner({
  groupId,
  fromCache,
}: {
  groupId: string
  fromCache: boolean
}) {
  const [pending, setPending] = useState(() => outboxPendingCount(groupId))
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  )
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    setPending(outboxPendingCount(groupId))
    const unsub = subscribeOutbox(() => setPending(outboxPendingCount(groupId)))
    function onOnline() {
      setOnline(true)
      setSyncing(true)
      void drainGroupOutbox().finally(() => setSyncing(false))
    }
    function onOffline() {
      setOnline(false)
      setSyncing(false)
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      unsub()
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [groupId])

  if (syncing) {
    return <p className="mt-1 text-xs text-muted-foreground">Syncing…</p>
  }
  if (!online || fromCache) {
    const waiting = pending > 0 ? ` ${pending} waiting to sync.` : ""
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        Saved on this phone.{waiting} Will sync when you're back online.
      </p>
    )
  }
  if (pending > 0) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {pending} waiting to sync
      </p>
    )
  }
  return null
}

export function TripSummaryStrip({
  group,
  seatId,
}: {
  group: Group
  seatId: string | null
}) {
  const stats = useMemo(() => tripStats(group), [group])
  const personalSpendTotal = useMemo(
    () => (seatId ? personalExpenditureForMember(group, seatId) : 0),
    [group, seatId]
  )
  const groupPaidTotal = useMemo(
    () =>
      seatId
        ? (groupPaidByMember(group).find((row) => row.memberId === seatId)?.amount ?? 0)
        : 0,
    [group, seatId]
  )
  const receivedTotal = useMemo(
    () => (seatId ? paidBackReceivedForMember(group, seatId) : 0),
    [group, seatId]
  )
  const mine = seatId ? stats.byMember[seatId] : null
  const net = mine?.net ?? 0
  const balance =
    Math.abs(net) < 0.02
      ? { label: "Balance", text: "Even", className: "text-muted-foreground" }
      : net < 0
        ? {
            label: "You owe",
            text: formatMoney(Math.abs(net), group.currency),
            className: "text-stamp",
          }
        : {
            label: "You're owed",
            text: formatMoney(net, group.currency),
            className: "text-moss",
          }

  return (
    <div className="rounded-xl border bg-card/50 px-3 py-2 lg:px-4 lg:py-2.5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-2">
        <div>
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase lg:text-[11px]">
            Trip spend
          </p>
          <p className="font-heading text-lg lg:text-xl">
            {formatMoney(stats.totalSpend, group.currency)}
          </p>
        </div>
        {seatId && mine ? (
          <>
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Your share
              </p>
              <p className="font-heading text-lg lg:text-xl">
                {formatMoney(mine.share, group.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase lg:text-[11px]">
                You paid (group)
              </p>
              <p className="font-heading text-lg lg:text-xl">
                {formatMoney(groupPaidTotal, group.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase lg:text-[11px]">
                You received
              </p>
              <p className="font-heading text-lg lg:text-xl">
                {formatMoney(receivedTotal, group.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase lg:text-[11px]">
                Personal spend
              </p>
              <p className="font-heading text-lg lg:text-xl">
                {formatMoney(personalSpendTotal, group.currency)}
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase lg:text-[11px]">
                {balance.label}
              </p>
              <p className={`font-heading text-lg lg:text-xl ${balance.className}`}>
                {balance.text}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground sm:col-span-3">
            Claim a nickname to see your share, what you paid, and your balance.
          </p>
        )}
      </div>
    </div>
  )
}

export function TripNavTabs({
  tripPath,
  active,
  tabHref,
  showSettings = false,
}: {
  tripPath: string
  active: TripTabId
  tabHref: (tab: "settle" | "ledger" | "people") => string
  showSettings?: boolean
}) {
  const tabClass = (tab: TripTabId) =>
    tab === active
      ? "bg-background text-foreground shadow-sm"
      : "text-foreground/60 hover:bg-background/80 hover:text-foreground"

  return (
    <div className="flex h-auto shrink-0 flex-wrap gap-1 rounded-lg border bg-muted p-[3px]">
      {(["settle", "ledger", "people"] as const).map((tab) => (
        <Link
          key={tab}
          href={tabHref(tab)}
          className={`relative inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap capitalize transition-colors ${tabClass(tab)}`}
        >
          {tab}
        </Link>
      ))}
      <Link
        href={`${tripPath}/analytics`}
        className={`relative inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors ${tabClass("analytics")}`}
      >
        Analytics
      </Link>
      {showSettings ? (
        <Link
          href={`${tripPath}/settings`}
          className={`relative inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors ${tabClass("settings" as TripTabId)}`}
        >
          Settings
        </Link>
      ) : null}
    </div>
  )
}

export function TripPageChrome({
  group,
  profile,
  tripPath,
  seatId,
  isTripAdmin,
  canWrite,
  busy,
  copied,
  fromCache,
  activeTab,
  tabHref,
  onCopy,
  onImportCsvReady,
  onImportCsvError,
  onPaymentOpen,
  onAddExpense,
  children,
}: {
  group: Group
  profile: PublicProfile | null
  tripPath: string
  seatId: string | null
  isTripAdmin: boolean
  canWrite: boolean
  busy: boolean
  copied: boolean
  fromCache: boolean
  activeTab: TripTabId
  tabHref: (tab: "settle" | "ledger" | "people") => string
  onCopy: (value: string) => void
  onImportCsvReady: (text: string) => void
  onImportCsvError: (message: string) => void
  onPaymentOpen: () => void
  onAddExpense: () => void
  children: ReactNode
}) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const tripDates = formatTripDates(group)

  return (
    <div className={`flex flex-col gap-3 lg:gap-3 ${tripDeskScrollClass}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 className="font-heading text-2xl tracking-tight sm:text-3xl lg:text-2xl">
              {group.name}
            </h2>
            {tripDates ? (
              <p className="text-sm text-muted-foreground">{tripDates}</p>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {seatId
              ? `You: ${group.members.find((m) => m.id === seatId)?.name ?? "?"}.`
              : "Claim a nickname to log spends."}
            {isTripAdmin ? (
              <>
                {" · "}
                <Link
                  href={`${tripPath}/settings`}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Trip settings
                </Link>
              </>
            ) : null}
          </p>
          <TripSyncBanner groupId={group.id} fromCache={fromCache} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 lg:gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5">
            <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Join code
            </span>
            <span className="font-mono text-sm font-semibold tracking-widest tabular-nums">
              {group.code}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onCopy(group.code)}
            >
              {copied ? <Check /> : <Link2 />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          {profile && isTripAdmin ? (
            <Button variant="outline" onClick={() => downloadTripCsvFile(group)}>
              <Download /> Export CSV
            </Button>
          ) : null}
          {isTripAdmin && profile ? (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return
                  try {
                    const text = await file.text()
                    parseTripCsv(text)
                    onImportCsvReady(text)
                  } catch (error) {
                    onImportCsvError(
                      error instanceof Error ? error.message : "Could not read that CSV."
                    )
                  }
                }}
              />
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload /> Import CSV
              </Button>
            </>
          ) : null}
          {profile ? (
            <>
              <Button variant="outline" onClick={onPaymentOpen} disabled={!canWrite}>
                <Banknote /> Paid back
              </Button>
              <Button onClick={onAddExpense} disabled={!canWrite}>
                <Receipt /> Add spend
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <TripSummaryStrip group={group} seatId={seatId} />
      <TripNavTabs
        tripPath={tripPath}
        active={activeTab}
        tabHref={tabHref}
        showSettings={isTripAdmin}
      />
      {children}
    </div>
  )
}
