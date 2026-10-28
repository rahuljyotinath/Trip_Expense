"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { Shell, TripDesk } from "@/components/waybill-app"
import { useTripLoad } from "@/components/trip/use-trip-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { claimSeat, logoutUser } from "@/lib/client-api"
import { AlertCircle } from "lucide-react"

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "That failed."
}

export function TripPage() {
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
    pendingJoinRequests,
    pendingTripInvites,
    linkedProfiles,
    refreshGroup,
  } = useTripLoad(groupId, tripPath)

  const [deskError, setDeskError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)

  async function copyInvite(value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  async function onClaim(memberId: string) {
    if (!profile || !group) return
    setBusy(true)
    setDeskError(null)
    try {
      const next = await claimSeat(group.id, memberId, profile.id)
      setGroup(next)
    } catch (err) {
      setDeskError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    await logoutUser()
    router.replace("/login")
  }

  if (loading) {
    return (
      <Shell health={health} profile={profile} compact>
        <p className="text-sm text-muted-foreground">Loading trip…</p>
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
        <TripDesk
          profile={profile}
          group={group}
          tripPath={tripPath}
          busy={busy}
          copied={copied}
          expenseOpen={expenseOpen}
          memberOpen={memberOpen}
          paymentOpen={paymentOpen}
          onExpenseOpen={setExpenseOpen}
          onMemberOpen={setMemberOpen}
          onPaymentOpen={setPaymentOpen}
          onCopy={copyInvite}
          onRefresh={async () => {
            await refreshGroup()
          }}
          onGroup={setGroup}
          onError={setDeskError}
          onBusy={setBusy}
          onClaim={profile ? onClaim : undefined}
          fromCache={fromCache}
          pendingJoinRequests={pendingJoinRequests}
          pendingTripInvites={pendingTripInvites}
          linkedProfiles={linkedProfiles}
        />
      </div>
    </Shell>
  )
}
