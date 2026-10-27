"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Shell } from "@/components/waybill-app"
import { TripAnalytics } from "@/components/trip/trip-analytics"
import { useTripLoad } from "@/components/trip/use-trip-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { logoutUser } from "@/lib/client-api"
import { AlertCircle } from "lucide-react"

export function TripAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const rawId = params.id
  const groupId = Array.isArray(rawId) ? rawId[0] ?? "" : String(rawId ?? "")
  const tripPath = groupId ? `/trip/${groupId}` : "/"

  const { health, profile, group, loadError, loading } = useTripLoad(
    groupId,
    `${tripPath}/analytics`
  )

  async function onLogout() {
    await logoutUser()
    router.replace("/login")
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

  return (
    <Shell
      health={health}
      profile={profile}
      compact
      onHome={() => router.push("/")}
      onLogout={profile ? () => void onLogout() : undefined}
    >
      <TripAnalytics group={group} tripPath={tripPath} />
    </Shell>
  )
}
