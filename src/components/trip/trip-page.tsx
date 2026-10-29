"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Shell } from "@/components/trip/trip-shell"
import { TripDesk } from "@/components/trip/trip-desk"
import { useTripLoad } from "@/components/trip/use-trip-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  claimSeat,
  logoutUser,
  pendingTripInviteBanner,
  respondTripInvite,
} from "@/lib/client-api"
import { PageLoadFallback } from "@/components/page-load-fallback"
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
    linkedProfiles,
    viewerTripInvite,
    refreshGroup,
  } = useTripLoad(groupId, tripPath)

  const [deskError, setDeskError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [dismissedInviteId, setDismissedInviteId] = useState<string | null>(
    null
  )

  const emailInvite = useMemo(() => {
    if (!group) return null
    const banner = pendingTripInviteBanner(viewerTripInvite, group)
    if (!banner || banner.id === dismissedInviteId) return null
    return banner
  }, [group, viewerTripInvite, dismissedInviteId])

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
      const next = await claimSeat(group.id, memberId, profile.id, group.code)
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

  if (loading && !group) {
    return <PageLoadFallback message="Loading trip…" compact />
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
        {emailInvite ? (
          <Alert className="mb-4 shrink-0">
            <AlertTitle>Trip invite</AlertTitle>
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                You were invited to <span className="font-medium">{emailInvite.tripName}</span>.
                Accept to join the roster, then claim your nickname.
              </span>
              <Button
                size="sm"
                className="shrink-0"
                disabled={busy}
                onClick={() => {
                  if (!emailInvite) return
                  setBusy(true)
                  setDeskError(null)
                  void respondTripInvite("accept", emailInvite.id)
                    .then((next) => {
                      setDismissedInviteId(emailInvite.id)
                      if (next) router.push(`/?join=${encodeURIComponent(next.code)}`)
                      return refreshGroup()
                    })
                    .catch((err) => setDeskError(errorText(err)))
                    .finally(() => setBusy(false))
                }}
              >
                Accept invite
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <TripDesk
          profile={profile}
          group={group}
          tripPath={tripPath}
          busy={busy}
          copied={copied}
          expenseOpen={expenseOpen}
          paymentOpen={paymentOpen}
          onExpenseOpen={setExpenseOpen}
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
          linkedProfiles={linkedProfiles}
        />
      </div>
    </Shell>
  )
}
