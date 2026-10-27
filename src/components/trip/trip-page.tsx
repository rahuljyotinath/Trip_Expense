"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Shell, TripDesk } from "@/components/waybill-app"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { profileNeedsSetup } from "@/lib/auth-ops"
import {
  claimSeat,
  fetchGroup,
  fetchSessionProfile,
  loadHealth,
  logoutUser,
  syncProfileToLocalStore,
  type Health,
} from "@/lib/client-api"
import type { Group, PublicProfile } from "@/lib/types"
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

  const [health, setHealth] = useState<Health | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deskError, setDeskError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!groupId) return

    let cancelled = false

    ;(async () => {
      setLoading(true)
      setLoadError(null)
      setDeskError(null)
      setGroup(null)
      try {
        const [nextHealth, session, nextGroup] = await Promise.all([
          loadHealth(),
          fetchSessionProfile(),
          fetchGroup(groupId, { skipHealth: true }),
        ])
        if (cancelled) return
        setHealth(nextHealth)
        if (session?.id && session.username) {
          if (profileNeedsSetup(session)) {
            router.replace(
              `/profile/setup?next=${encodeURIComponent(tripPath)}`
            )
            return
          }
          setProfile(session)
          syncProfileToLocalStore(session)
        } else {
          setProfile(null)
        }
        setGroup(nextGroup)
      } catch (err) {
        if (!cancelled) setLoadError(errorText(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, router, tripPath])

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
    setProfile(null)
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
      {deskError ? (
        <Alert variant="destructive" className="mb-4">
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
          const next = await fetchGroup(group.id)
          setGroup(next)
        }}
        onGroup={setGroup}
        onError={setDeskError}
        onBusy={setBusy}
        onClaim={profile ? onClaim : undefined}
      />
    </Shell>
  )
}
