"use client"

import dynamic from "next/dynamic"
import { ProfileLink } from "@/components/profile/profile-link"
import { useEffect, useMemo, useState, type DragEvent } from "react"
import { useSearchParams } from "next/navigation"
import {
  ChevronDown,
  GripVertical,
  Pencil,
  Receipt,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  TripPageChrome,
  type TripTabId,
} from "@/components/trip/trip-page-chrome"
import {
  LedgerExpenseHeadline,
  LedgerPaidBackHeadline,
  SettlePaidBackLine,
} from "@/components/trip/ledger-transaction-rows"
import { tripTabPanelClass } from "@/components/trip/trip-desk-layout"
import { usernameForMemberProfile } from "@/lib/linked-trip-profiles"
import type { LinkedTripProfile } from "@/lib/types"
import {
  expenseRowMetaParts,
  expenseViewerSecondAmount,
  ledgerDayItems,
  ledgerDaysForViewer,
  ledgerPersonalExpensesForViewer,
  paymentViewerTone,
} from "@/lib/ledger-display"
import { todayIsoDate } from "@/lib/ids"
import { formatMoney } from "@/lib/money"
import { suggestedMember } from "@/lib/operations"
import { isTripAdmin } from "@/lib/trip-invites"
import { settlementBalances, simplifyDebts } from "@/lib/settle"
import { buildUpiPayUrl, upiIdForMemberProfile } from "@/lib/upi"
import { applyGroupPatchOptimistic } from "@/lib/group-patch-optimistic"
import type { Expense, Group, Payment, PublicProfile } from "@/lib/types"

const ExpenseDialog = dynamic(
  () =>
    import("@/components/trip/trip-expense-payment-dialogs").then((m) => ({
      default: m.ExpenseDialog,
    })),
  { ssr: false }
)
const PaymentDialog = dynamic(
  () =>
    import("@/components/trip/trip-expense-payment-dialogs").then((m) => ({
      default: m.PaymentDialog,
    })),
  { ssr: false }
)


function memberProfileId(group: Group, memberId: string) {
  return group.members.find((item) => item.id === memberId)?.profileId ?? null
}

function memberName(group: Group, id: string) {
  return group.members.find((member) => member.id === id)?.name ?? "Unknown"
}

function mySeat(group: Group, profileId: string) {
  return group.members.find((member) => member.profileId === profileId) ?? null
}

function formatDay(date: string) {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatDayDots(isoDate: string) {
  const [y, m, d] = isoDate.split("-")
  if (!y || !m || !d) return isoDate
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`
}

function reorderDayItemIds(ids: string[], dragId: string, targetId: string) {
  const from = ids.indexOf(dragId)
  const to = ids.indexOf(targetId)
  if (from < 0 || to < 0 || from === to) return ids
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, dragId)
  return next
}

export function TripDesk({
  profile,
  group,
  tripPath,
  busy,
  copied,
  expenseOpen,
  paymentOpen,
  onExpenseOpen,
  onPaymentOpen,
  onCopy,
  onRefresh,
  onGroup,
  onError,
  onBusy,
  onClaim,
  fromCache = false,
  linkedProfiles = [],
}: {
  profile: PublicProfile | null
  group: Group
  tripPath: string
  busy: boolean
  copied: boolean
  expenseOpen: boolean
  paymentOpen: boolean
  onExpenseOpen: (open: boolean) => void
  onPaymentOpen: (open: boolean) => void
  onCopy: (value: string) => void
  onRefresh: () => Promise<void>
  onGroup: (group: Group) => void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
  onClaim?: (memberId: string) => void
  fromCache?: boolean
  linkedProfiles?: LinkedTripProfile[]
}) {
  const seat = profile ? mySeat(group, profile.id) : null
  const isAdmin = profile ? isTripAdmin(group, profile.id) : false
  const canWrite = Boolean(profile && seat)
  const claimSuggestion = profile && !seat ? suggestedMember(group, profile.name) : null
  const balances = useMemo(() => settlementBalances(group), [group])
  const transfers = useMemo(() => simplifyDebts(group), [group])
  const personalLedgerExpenses = useMemo(
    () => ledgerPersonalExpensesForViewer(group, seat?.id ?? null),
    [group, seat?.id]
  )
  const ledgerDays = useMemo(
    () => ledgerDaysForViewer(group, seat?.id ?? null),
    [group, seat?.id]
  )
  const memberIds = useMemo(() => group.members.map((member) => member.id), [group.members])
  const viewerMemberId = seat?.id ?? null
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [draftExpenseDate, setDraftExpenseDate] = useState<string | null>(null)
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<Expense | null>(null)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [dragRowId, setDragRowId] = useState<string | null>(null)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(() => new Set())
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const deskTab: TripTabId =
    tabParam === "settle" || tabParam === "people" ? tabParam : "ledger"
  function tabHref(tab: "settle" | "ledger" | "people") {
    return tab === "ledger" ? tripPath : `${tripPath}?tab=${tab}`
  }

  function toggleDayCollapsed(date: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function collapseAllLedgerDays() {
    setCollapsedDays(new Set(ledgerDays.map((day) => day.date)))
  }

  function expandAllLedgerDays() {
    setCollapsedDays(new Set())
  }

  function openNewExpense(forDate?: string) {
    setEditingExpense(null)
    setDraftExpenseDate(forDate ?? null)
    onExpenseOpen(true)
  }
  const [importCsvText, setImportCsvText] = useState<string | null>(null)
  useEffect(() => {
    document.title = `${group.name} — Tripzy`
    return () => {
      document.title = "Tripzy"
    }
  }, [group.name])

  useEffect(() => {
    function scrollToLedgerHash() {
      const hash = typeof window !== "undefined" ? window.location.hash : ""
      if (!hash.startsWith("#ledger-day-")) return
      const el = document.querySelector(hash)
      if (el instanceof HTMLElement) {
        window.requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" })
        })
      }
    }
    scrollToLedgerHash()
    window.addEventListener("hashchange", scrollToLedgerHash)
    return () => window.removeEventListener("hashchange", scrollToLedgerHash)
  }, [group.id])

  return (
    <div className="flex flex-1 flex-col">
      <TripPageChrome
        group={group}
        profile={profile}
        tripPath={tripPath}
        seatId={seat?.id ?? null}
        isTripAdmin={isAdmin}
        canWrite={canWrite}
        busy={busy}
        copied={copied}
        fromCache={fromCache}
        activeTab={deskTab}
        tabHref={tabHref}
        onCopy={onCopy}
        onImportCsvReady={setImportCsvText}
        onImportCsvError={onError}
        onPaymentOpen={() => {
          setEditingPayment(null)
          onPaymentOpen(true)
        }}
        onAddExpense={() => openNewExpense()}
      >
      <Tabs value={deskTab} className="flex flex-col gap-2">
        <TabsContent value="settle" className={tripTabPanelClass}>
          <div className="space-y-2">
          {transfers.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Books are even</CardTitle>
                <CardDescription>
                  {group.expenses.every((item) => item.voidedAt)
                    ? "No spends yet. Log the first one from the ledger tab."
                    : "Everyone is square on the current ledger."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            transfers.map((transfer, index) => {
              const creditorUpi =
                group.currency === "INR"
                  ? upiIdForMemberProfile(
                      linkedProfiles,
                      memberProfileId(group, transfer.toMemberId)
                    )
                  : null
              const viewerOwes = Boolean(seat && seat.id === transfer.fromMemberId)
              return (
              <Card
                key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <CardContent className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    <span className="font-medium">
                      {memberName(group, transfer.fromMemberId)}
                    </span>{" "}
                    pays{" "}
                    <span className="font-medium">
                      {memberName(group, transfer.toMemberId)}
                    </span>
                  </p>
                  <div className="flex items-center gap-3">
                    <p className="font-heading text-2xl">
                      {formatMoney(transfer.amount, group.currency)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {creditorUpi ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            const url = buildUpiPayUrl({
                              payeeAddress: creditorUpi,
                              payeeName: memberName(group, transfer.toMemberId),
                              amount: transfer.amount,
                              note: `Tripzy ${group.name}`.slice(0, 80),
                            })
                            window.location.href = url
                          }}
                        >
                          Pay UPI
                        </Button>
                      ) : null}
                      {canWrite && profile ? (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            applyGroupPatchOptimistic({
                              group,
                              profile,
                              body: {
                                action: "add-payment",
                                date: todayIsoDate(),
                                amount: transfer.amount,
                                fromMemberId: transfer.fromMemberId,
                                toMemberId: transfer.toMemberId,
                                profileId: profile.id,
                              },
                              onGroup,
                              onError,
                              onBusy,
                              refresh: onRefresh,
                            })
                          }}
                        >
                          Mark paid
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {group.currency === "INR" && !creditorUpi && viewerOwes ? (
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Ask {memberName(group, transfer.toMemberId)} to add a UPI ID in profile for
                      one-tap pay.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            )})
          )}
          {(group.payments ?? []).length > 0 ? (
            <div className="space-y-2">
              <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Paid back
              </p>
              {(group.payments ?? []).map((payment) => {
                const crossed = Boolean(payment.voidedAt)
                const canEdit =
                  profile &&
                  (payment.createdByProfileId === profile.id || isAdmin)
                return (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <SettlePaidBackLine
                      group={group}
                      payment={payment}
                      viewerMemberId={seat?.id ?? null}
                      dateLabel={formatDay(payment.date)}
                      crossed={crossed}
                    />
                    <p
                      className={`shrink-0 tabular-nums ${crossed ? "text-muted-foreground line-through" : ""}`}
                    >
                      {formatMoney(payment.amount, group.currency)}
                    </p>
                    {canEdit ? (
                      <span className="flex shrink-0 gap-0.5">
                        {!crossed ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={busy}
                            aria-label="Edit paid-back"
                            onClick={() => {
                              setEditingPayment(payment)
                              onPaymentOpen(true)
                            }}
                          >
                            <Pencil />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy}
                          aria-label={crossed ? "Restore paid-back" : "Delete paid-back"}
                          onClick={() => {
                            applyGroupPatchOptimistic({
                              group,
                              profile,
                              body: {
                                action: "void-payment",
                                paymentId: payment.id,
                                profileId: profile.id,
                                restore: crossed,
                              },
                              onGroup,
                              onError,
                              onBusy,
                              refresh: onRefresh,
                            })
                          }}
                        >
                          {crossed ? <RotateCcw /> : <Trash2 />}
                        </Button>
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.members.map((member) => {
              const value = balances[member.id] ?? 0
              return (
                <div
                  key={member.id}
                  className="interactive-row flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-sm lg:px-3 lg:py-2"
                >
                  <span>
                    {member.name}
                    {profile && member.profileId === profile.id ? " · you" : ""}
                  </span>
                  <span className={value >= 0 ? "text-moss" : "text-stamp"}>
                    {value >= 0 ? "is owed " : "owes "}
                    {formatMoney(Math.abs(value), group.currency)}
                  </span>
                </div>
              )
            })}
          </div>
          </div>
        </TabsContent>
        <TabsContent value="ledger" className={tripTabPanelClass}>
          {ledgerDays.length >= 2 ? (
            <div className="mb-2 flex shrink-0 justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={collapseAllLedgerDays}
              >
                Collapse all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={expandAllLedgerDays}
              >
                Expand all
              </Button>
            </div>
          ) : null}
          <div className="space-y-4">
          {ledgerDays.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No group spends yet</CardTitle>
                <CardDescription>
                  Shared bills and your paid-back transfers appear here by day (oldest first).
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-4">
              {ledgerDays.map((day) => {
                const collapsed = collapsedDays.has(day.date)
                return (
                  <section
                    key={day.date}
                    id={`ledger-day-${day.date}`}
                    className="scroll-mt-16 overflow-hidden rounded-xl border bg-card/50"
                  >
                    <div className="sticky top-0 z-10 grid grid-cols-1 items-center gap-x-4 gap-y-2 border-b bg-card px-3 py-2.5 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2 text-left"
                        aria-expanded={!collapsed}
                        onClick={() => toggleDayCollapsed(day.date)}
                      >
                        <ChevronDown
                          className={`size-4 shrink-0 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
                        />
                        <h3 className="font-heading text-base">{formatDay(day.date)}</h3>
                      </button>
                      {canWrite ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          className="w-full sm:w-auto"
                          onClick={() => openNewExpense(day.date)}
                        >
                          <Receipt className="size-3.5" />
                          <span className="sm:hidden">Add</span>
                          <span className="hidden sm:inline">
                            Add expense for {formatDayDots(day.date)}
                          </span>
                        </Button>
                      ) : (
                        <span className="hidden sm:block" />
                      )}
                      <p className="font-heading text-base tabular-nums sm:min-w-[5.5rem] sm:text-right">
                        {formatMoney(day.groupSpendTotal, group.currency)}
                      </p>
                    </div>
                    {!collapsed ? (
                      <div className="divide-y divide-border/60">
                        {(() => {
                          const dayItems = ledgerDayItems(day, group.ledgerDayOrder)
                          function applyDayReorder(dragId: string, targetId: string) {
                            if (!profile || !canWrite) return
                            const ids = dayItems.map((row) =>
                              row.kind === "expense" ? row.expense.id : row.payment.id
                            )
                            applyGroupPatchOptimistic({
                              group,
                              profile,
                              body: {
                                action: "reorder-ledger-day",
                                date: day.date,
                                orderedIds: reorderDayItemIds(ids, dragId, targetId),
                                profileId: profile.id,
                              },
                              onGroup,
                              onError,
                              onBusy,
                              refresh: onRefresh,
                            })
                          }
                          function rowDragHandlers(rowId: string) {
                            return {
                              draggable: canWrite,
                              onDragStart: () => setDragRowId(rowId),
                              onDragEnd: () => setDragRowId(null),
                              onDragOver: (event: DragEvent) => {
                                event.preventDefault()
                              },
                              onDrop: (event: DragEvent) => {
                                event.preventDefault()
                                if (dragRowId && dragRowId !== rowId) {
                                  applyDayReorder(dragRowId, rowId)
                                }
                                setDragRowId(null)
                              },
                            }
                          }
                          return dayItems.map((item) => {
                          if (item.kind === "payment") {
                            const payment = item.payment
                            const canEditPayment =
                              profile &&
                              (payment.createdByProfileId === profile.id || isAdmin)
                            const tone = paymentViewerTone(payment, viewerMemberId)
                            const paymentGridCols = canWrite
                              ? viewerMemberId
                                ? "sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]"
                                : "sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                              : viewerMemberId
                                ? "sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                                : "sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                            return (
                              <div
                                key={payment.id}
                                {...rowDragHandlers(payment.id)}
                                className={`gap-x-2 px-3 py-2 max-sm:flex max-sm:items-start max-sm:gap-2 sm:grid sm:items-center sm:py-1.5 ${paymentGridCols}`}
                              >
                                {canWrite ? (
                                  <GripVertical
                                    className="size-3.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing max-sm:mt-0.5"
                                    aria-hidden
                                  />
                                ) : null}
                                <div className="min-w-0 flex-1 sm:contents">
                                  <LedgerPaidBackHeadline
                                    group={group}
                                    payment={payment}
                                    viewerMemberId={viewerMemberId}
                                  />
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1 sm:contents">
                                <p className="shrink-0 text-sm tabular-nums">
                                  {formatMoney(payment.amount, group.currency)}
                                </p>
                                {viewerMemberId ? (
                                  <p
                                    className={`max-sm:text-[11px] sm:w-[6.75rem] sm:shrink-0 sm:truncate sm:text-right sm:text-[11px] ${
                                      tone === "received"
                                        ? "text-moss"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {tone === "received"
                                      ? "You received"
                                      : tone === "paid-back"
                                        ? "You paid back"
                                        : "—"}
                                  </p>
                                ) : null}
                                {canEditPayment ? (
                                  <span className="flex shrink-0 gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      disabled={busy}
                                      aria-label="Edit paid-back"
                                      onClick={() => {
                                        setEditingPayment(payment)
                                        onPaymentOpen(true)
                                      }}
                                    >
                                      <Pencil />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      disabled={busy}
                                      aria-label="Delete paid-back"
                                      onClick={() => {
                                        applyGroupPatchOptimistic({
                                          group,
                                          profile,
                                          body: {
                                            action: "void-payment",
                                            paymentId: payment.id,
                                            profileId: profile.id,
                                            restore: false,
                                          },
                                          onGroup,
                                          onError,
                                          onBusy,
                                          refresh: onRefresh,
                                        })
                                      }}
                                    >
                                      <Trash2 />
                                    </Button>
                                  </span>
                                ) : null}
                                </div>
                              </div>
                            )
                          }
                          const expense = item.expense
                          const canEdit =
                            profile &&
                            (expense.createdByProfileId === profile.id || isAdmin)
                          const second = expenseViewerSecondAmount(
                            expense,
                            viewerMemberId,
                            memberIds
                          )
                          const rowMeta = expenseRowMetaParts(
                            group,
                            expense,
                            viewerMemberId
                          )
                          const shareTone =
                            second.kind === "lent"
                              ? "text-moss"
                              : second.kind === "owe"
                                ? "text-stamp"
                                : "text-muted-foreground"
                          const shareLabel =
                            second.kind === "lent"
                              ? `You lent ${formatMoney(second.amount, group.currency)}`
                              : second.kind === "owe"
                                ? `You owe ${formatMoney(second.amount, group.currency)}`
                                : "—"
                          const editButtons = canEdit ? (
                            <span className="flex shrink-0 gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                disabled={busy}
                                aria-label="Edit spend"
                                onClick={() => {
                                  setEditingExpense(expense)
                                  onExpenseOpen(true)
                                }}
                              >
                                <Pencil />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                disabled={busy}
                                aria-label="Delete spend"
                                onClick={() => setDeleteExpenseTarget(expense)}
                              >
                                <Trash2 />
                              </Button>
                            </span>
                          ) : null
                          const expenseGridCols = canWrite
                            ? viewerMemberId
                              ? "sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]"
                              : "sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                            : viewerMemberId
                              ? "sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                              : "sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                          return (
                            <div
                              key={expense.id}
                              {...rowDragHandlers(expense.id)}
                              className={`px-3 py-2 max-sm:flex max-sm:items-start max-sm:gap-2 sm:grid sm:grid-rows-[auto_auto] sm:items-center sm:gap-x-2 sm:gap-y-0.5 sm:py-1.5 ${expenseGridCols}`}
                            >
                              {canWrite ? (
                                <GripVertical
                                  className="size-3.5 shrink-0 cursor-grab self-center text-muted-foreground active:cursor-grabbing max-sm:mt-1 sm:col-start-1 sm:row-span-2"
                                  aria-hidden
                                />
                              ) : null}
                              <div className="min-w-0 flex-1 max-sm:space-y-0.5 sm:contents">
                                <LedgerExpenseHeadline
                                  reason={expense.reason}
                                  rowMeta={rowMeta}
                                  className={
                                    canWrite ? "sm:col-start-2 sm:row-start-1" : "sm:col-start-1 sm:row-start-1"
                                  }
                                />
                                <p
                                  className={`break-words text-[11px] leading-snug text-muted-foreground sm:truncate ${
                                    canWrite ? "sm:col-start-2 sm:row-start-2" : "sm:col-start-1 sm:row-start-2"
                                  }`}
                                >
                                  Shared by {rowMeta.sharedWith}
                                </p>
                                {viewerMemberId ? (
                                  <p
                                    className={`text-[11px] tabular-nums sm:hidden ${shareTone}`}
                                  >
                                    {shareLabel}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1 max-sm:pt-0.5 sm:contents">
                                <p
                                  className={`text-right text-sm tabular-nums sm:row-span-2 sm:self-center ${
                                    canWrite ? "sm:col-start-3 sm:row-start-1" : "sm:col-start-2 sm:row-start-1"
                                  }`}
                                >
                                  {formatMoney(expense.amount, group.currency)}
                                </p>
                                {viewerMemberId ? (
                                  <p
                                    className={`hidden w-[6.75rem] truncate text-right text-[11px] tabular-nums sm:block sm:row-span-2 sm:self-center ${
                                      canWrite ? "sm:col-start-4 sm:row-start-1" : "sm:col-start-3 sm:row-start-1"
                                    } ${shareTone}`}
                                  >
                                    {shareLabel}
                                  </p>
                                ) : null}
                                {editButtons ? (
                                  <span
                                    className={
                                      canWrite
                                        ? viewerMemberId
                                          ? "sm:col-start-5 sm:row-span-2 sm:row-start-1 sm:self-center"
                                          : "sm:col-start-4 sm:row-span-2 sm:row-start-1 sm:self-center"
                                        : viewerMemberId
                                          ? "sm:col-start-4 sm:row-span-2 sm:row-start-1 sm:self-center"
                                          : "sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center"
                                    }
                                  >
                                    {editButtons}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          )
                        })
                        })()}
                      </div>
                    ) : null}
                  </section>
                )
              })}
            </div>
          )}
          {personalLedgerExpenses.length > 0 ? (
            <section className="space-y-2 border-t pt-4">
              <div>
                <h3 className="font-heading text-base">Your personal spends</h3>
                <p className="text-sm text-muted-foreground">
                  Solo spends only you see — not mixed into group splits.
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personalLedgerExpenses.map((expense) => (
                      <tr key={expense.id} className="border-b last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDay(expense.date)}</td>
                        <td className="px-3 py-2">{expense.reason}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(expense.amount, group.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
          </div>
        </TabsContent>
        <TabsContent value="people" className={tripTabPanelClass}>
          <div className="space-y-2">
          {group.members.map((member) => {
            const cover = member.coveredByMemberId
              ? group.members.find((item) => item.id === member.coveredByMemberId)
              : null
            const settlesFor = group.members.filter(
              (item) => item.coveredByMemberId === member.id
            )
            const balance = balances[member.id] ?? 0
            const memberUsername = usernameForMemberProfile(
              linkedProfiles,
              member.profileId
            )
            const nameLine = (
              <>
                {member.name}
                {profile && member.profileId === profile.id ? " · you" : ""}
              </>
            )
            return (
              <div
                key={member.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {memberUsername ? (
                      <ProfileLink username={memberUsername}>{nameLine}</ProfileLink>
                    ) : (
                      nameLine
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {member.profileId
                      ? "Nickname matched to a profile"
                      : "Open nickname — they still need to claim"}
                  </p>
                  {cover ? (
                    <Badge variant="secondary" className="w-fit">
                      Covered by {cover.name}
                    </Badge>
                  ) : null}
                  {settlesFor.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Also settles for{" "}
                      {settlesFor.map((item) => item.name).join(", ")}
                    </p>
                  ) : null}
                  {!cover && Math.abs(balance) > 0.005 ? (
                    <p className="text-xs">
                      <span className={balance >= 0 ? "text-moss" : "text-stamp"}>
                        {balance >= 0 ? "Is owed " : "Owes "}
                        {formatMoney(Math.abs(balance), group.currency)}
                      </span>
                      <span className="text-muted-foreground"> (cash settle)</span>
                    </p>
                  ) : null}
                </div>
                {canWrite && profile ? (
                <label className="flex shrink-0 flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Settles cash</span>
                  <select
                    className="rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                    disabled={busy}
                    value={member.coveredByMemberId ?? member.id}
                    onChange={(event) => {
                      const picked = event.target.value
                      applyGroupPatchOptimistic({
                        group,
                        profile,
                        body: {
                          action: "cover-member",
                          memberId: member.id,
                          coveredByMemberId:
                            picked === member.id ? null : picked,
                          profileId: profile.id,
                        },
                        onGroup,
                        onError,
                        onBusy,
                        refresh: onRefresh,
                      })
                    }}
                  >
                    <option value={member.id}>Themselves</option>
                    {group.members
                      .filter((item) => item.id !== member.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                ) : null}
              </div>
            )
          })}
          {profile && !seat && onClaim ? (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Claim your seat</p>
              <p className="text-xs text-muted-foreground">
                Pick the nickname that is you on this trip.
              </p>
              <div className="flex flex-wrap gap-2">
                {group.members.map((member) => {
                  if (member.profileId) return null
                  const suggested = claimSuggestion?.id === member.id
                  return (
                    <Button
                      key={member.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => onClaim(member.id)}
                    >
                      {member.name}
                      {suggested ? " · looks like you" : ""}
                    </Button>
                  )
                })}
              </div>
            </div>
          ) : null}
          </div>
        </TabsContent>
      </Tabs>
      </TripPageChrome>

      <Dialog
        open={Boolean(importCsvText)}
        onOpenChange={(open) => {
          if (!open) setImportCsvText(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import trip CSV?</DialogTitle>
            <DialogDescription>
              This replaces everyone on the roster, every spend, and every paid-back
              entry on this trip. Join code stays the same.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportCsvText(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !importCsvText}
              onClick={() => {
                if (!importCsvText || !profile) return
                const csv = importCsvText
                applyGroupPatchOptimistic({
                  group,
                  profile,
                  body: {
                    action: "import-trip-csv",
                    csv,
                    profileId: profile.id,
                  },
                  onGroup,
                  onError,
                  onBusy,
                  onDone: () => setImportCsvText(null),
                  refresh: onRefresh,
                })
              }}
            >
              Replace from CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleteExpenseTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteExpenseTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this spend?</DialogTitle>
            <DialogDescription>
              {deleteExpenseTarget
                ? `“${deleteExpenseTarget.reason}” will be removed from the trip ledger.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteExpenseTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !deleteExpenseTarget}
              onClick={() => {
                if (!deleteExpenseTarget || !profile) return
                const expenseId = deleteExpenseTarget.id
                applyGroupPatchOptimistic({
                  group,
                  profile,
                  body: {
                    action: "delete-expense",
                    expenseId,
                    profileId: profile.id,
                  },
                  onGroup,
                  onError,
                  onBusy,
                  onDone: () => setDeleteExpenseTarget(null),
                  refresh: onRefresh,
                })
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {profile ? (
        <>
          <ExpenseDialog
            open={expenseOpen}
            expense={editingExpense}
            defaultDate={editingExpense ? null : draftExpenseDate}
            group={group}
            profile={profile}
            busy={busy}
            onOpen={(open) => {
              onExpenseOpen(open)
              if (!open) {
                setEditingExpense(null)
                setDraftExpenseDate(null)
              }
            }}
            onSaved={() => {
              onExpenseOpen(false)
              setEditingExpense(null)
              setDraftExpenseDate(null)
            }}
            onGroup={onGroup}
            onRefresh={onRefresh}
            onError={onError}
            onBusy={onBusy}
          />
          <PaymentDialog
            open={paymentOpen}
            group={group}
            profile={profile}
            busy={busy}
            editingPayment={editingPayment}
            onOpen={(open) => {
              onPaymentOpen(open)
              if (!open) setEditingPayment(null)
            }}
            onSaved={(next) => {
              onGroup(next)
              onPaymentOpen(false)
              setEditingPayment(null)
            }}
            onRefresh={onRefresh}
            onError={onError}
            onBusy={onBusy}
          />
        </>
      ) : null}
    </div>
  )
}
