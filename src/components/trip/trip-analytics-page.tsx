"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import {
  Shell,
  applyGroupPatchOptimistic,
  ExpenseDialog,
  PaymentDialog,
} from "@/components/waybill-app"
import { TripAnalytics } from "@/components/trip/trip-analytics"
import { TripPageChrome } from "@/components/trip/trip-page-chrome"
import { useTripLoad } from "@/components/trip/use-trip-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { logoutUser } from "@/lib/client-api"
import type { Group } from "@/lib/types"
import { AlertCircle } from "lucide-react"

function mySeat(group: Group, profileId: string) {
  return group.members.find((member) => member.profileId === profileId) ?? null
}

export function TripAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const rawId = params.id
  const groupId = Array.isArray(rawId) ? rawId[0] ?? "" : String(rawId ?? "")
  const tripPath = groupId ? `/trip/${groupId}` : "/"

  const {
    health,
    profile,
    group,
    setGroup,
    loadError,
    loading,
    fromCache,
    refreshGroup,
  } = useTripLoad(groupId, `${tripPath}/analytics`)

  const [deskError, setDeskError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [importCsvText, setImportCsvText] = useState<string | null>(null)

  async function copyInvite(value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  async function onLogout() {
    await logoutUser()
    router.replace("/login")
  }

  function tabHref(tab: "settle" | "ledger" | "people") {
    return tab === "ledger" ? tripPath : `${tripPath}?tab=${tab}`
  }

  if (loading) {
    return (
      <Shell health={health} profile={profile} compact>
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      </Shell>
    )
  }

  if (loadError || !group) {
    return (
      <Shell health={health} profile={profile} compact>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Trip not found</AlertTitle>
          <AlertDescription>
            {loadError ?? "This link may be wrong or expired."}
          </AlertDescription>
        </Alert>
        <Link href="/" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to home
        </Link>
      </Shell>
    )
  }

  const seat = profile ? mySeat(group, profile.id) : null
  const isOpener = profile ? group.createdByProfileId === profile.id : false
  const canWrite = Boolean(profile && seat)

  return (
    <Shell
      health={health}
      profile={profile}
      compact
      onHome={() => router.push("/")}
      onLogout={profile ? () => void onLogout() : undefined}
    >
      <div className="flex flex-1 flex-col">
        {deskError ? (
          <Alert variant="destructive" className="mb-4 shrink-0">
            <AlertCircle />
            <AlertTitle>Hold on</AlertTitle>
            <AlertDescription>{deskError}</AlertDescription>
          </Alert>
        ) : null}
        <TripPageChrome
          group={group}
          profile={profile}
          tripPath={tripPath}
          seatId={seat?.id ?? null}
          isOpener={isOpener}
          canWrite={canWrite}
          busy={busy}
          copied={copied}
          fromCache={fromCache}
          activeTab="analytics"
          tabHref={tabHref}
          onCopy={copyInvite}
          onImportCsvReady={setImportCsvText}
          onImportCsvError={setDeskError}
          onPaymentOpen={() => setPaymentOpen(true)}
          onAddExpense={() => setExpenseOpen(true)}
        >
          <TripAnalytics group={group} tripPath={tripPath} />
        </TripPageChrome>
      </div>
      <Dialog
        open={Boolean(importCsvText)}
        onOpenChange={(open) => !open && setImportCsvText(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import trip CSV?</DialogTitle>
            <DialogDescription>
              This replaces everyone on the roster, every spend, and every paid-back entry on
              this trip. Join code stays the same.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportCsvText(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !importCsvText || !profile}
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
                  onGroup: setGroup,
                  onError: setDeskError,
                  onBusy: setBusy,
                  onDone: () => setImportCsvText(null),
                  refresh: async () => {
                    await refreshGroup()
                  },
                })
              }}
            >
              Replace from CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {profile ? (
        <>
          <ExpenseDialog
            open={expenseOpen}
            expense={null}
            defaultDate={null}
            group={group}
            profile={profile}
            busy={busy}
            onOpen={setExpenseOpen}
            onSaved={() => setExpenseOpen(false)}
            onGroup={setGroup}
            onRefresh={async () => {
              await refreshGroup()
            }}
            onError={setDeskError}
            onBusy={setBusy}
          />
          <PaymentDialog
            open={paymentOpen}
            group={group}
            profile={profile}
            busy={busy}
            onOpen={setPaymentOpen}
            onSaved={setGroup}
            onRefresh={async () => {
              await refreshGroup()
            }}
            onError={setDeskError}
            onBusy={setBusy}
          />
        </>
      ) : null}
    </Shell>
  )
}
