"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { Shell } from "@/components/trip/trip-shell"
import { applyGroupPatchOptimistic } from "@/lib/group-patch-optimistic"
import { TripAdminInvitesPanel } from "@/components/trip/trip-admin-invites-panel"
import { useTripLoad } from "@/components/trip/use-trip-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { tripSubpageScrollPad } from "@/components/trip/trip-desk-layout"
import { TripMobileBottomNav } from "@/components/trip/trip-mobile-nav"
import { logoutUser } from "@/lib/client-api"
import { isTripAdmin } from "@/lib/trip-invites"
import { cn } from "@/lib/utils"
import type { Group, PublicProfile } from "@/lib/types"
import { PageLoadFallback } from "@/components/page-load-fallback"
import { AlertCircle } from "lucide-react"

export function TripSettingsPage() {
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
    pendingJoinRequests,
    pendingTripInvites,
    refreshGroup,
  } = useTripLoad(groupId, `${tripPath}/settings`)

  const [deskError, setDeskError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onLogout() {
    await logoutUser()
    router.replace("/login")
  }

  if (loading) {
    return <PageLoadFallback message="Loading settings…" compact />
  }

  if (loadError || !group) {
    return (
      <Shell health={health} profile={profile} compact>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Trip not found</AlertTitle>
          <AlertDescription>{loadError ?? "This link may be wrong or expired."}</AlertDescription>
        </Alert>
        <Link href="/" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to home
        </Link>
      </Shell>
    )
  }

  function tabHref(tab: "settle" | "ledger" | "people") {
    return tab === "ledger" ? tripPath : `${tripPath}?tab=${tab}`
  }

  if (!profile || !isTripAdmin(group, profile.id)) {
    return (
      <Shell health={health} profile={profile} compact onHome={() => router.push(tripPath)}>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Admins only</AlertTitle>
          <AlertDescription>Trip settings are only for trip admins.</AlertDescription>
        </Alert>
        <Link href={tripPath} className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to trip
        </Link>
      </Shell>
    )
  }

  return (
    <Shell
      health={health}
      profile={profile}
      compact
      onHome={() => router.push(tripPath)}
      onLogout={() => void onLogout()}
    >
      <div className={cn("mx-auto max-w-2xl space-y-6 pb-8", tripSubpageScrollPad)}>
        <div>
          <Link href={tripPath} className="text-sm text-muted-foreground underline underline-offset-4">
            ← Back to trip
          </Link>
          <h1 className="font-heading mt-2 text-3xl">Trip settings</h1>
          <p className="text-sm text-muted-foreground">{group.name}</p>
        </div>
        {deskError ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Hold on</AlertTitle>
            <AlertDescription>{deskError}</AlertDescription>
          </Alert>
        ) : null}
        <TripDetailsCard
          group={group}
          profile={profile}
          busy={busy}
          onGroup={setGroup}
          onError={setDeskError}
          onBusy={setBusy}
        />
        <TripRosterCard
          group={group}
          profile={profile}
          busy={busy}
          onGroup={setGroup}
          onError={setDeskError}
          onBusy={setBusy}
          onRefresh={async () => {
            await refreshGroup()
          }}
        />
        <TripAdminsCard
          group={group}
          profile={profile}
          busy={busy}
          onGroup={setGroup}
          onError={setDeskError}
          onBusy={setBusy}
        />
        <TripAdminInvitesPanel
          group={group}
          profile={profile}
          busy={busy}
          pendingTripInvites={pendingTripInvites}
          pendingJoinRequests={pendingJoinRequests}
          onGroup={setGroup}
          onError={setDeskError}
          onBusy={setBusy}
          onRefresh={async () => {
            await refreshGroup()
          }}
        />
      </div>
      <TripMobileBottomNav
        tripPath={tripPath}
        active="settings"
        tabHref={tabHref}
        showSettings
      />
    </Shell>
  )
}

function TripDetailsCard({
  group,
  profile,
  busy,
  onGroup,
  onError,
  onBusy,
}: {
  group: Group
  profile: PublicProfile
  busy: boolean
  onGroup: (group: Group) => void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  const [name, setName] = useState(group.name)
  const [startDate, setStartDate] = useState(group.startDate ?? "")
  const [endDate, setEndDate] = useState(group.endDate ?? "")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trip details</CardTitle>
        <CardDescription>Name and dates. Currency stays as set when the trip opened.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="settings-trip-name">Trip name</Label>
          <Input
            id="settings-trip-name"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="settings-start">Start</Label>
            <Input
              id="settings-start"
              type="date"
              value={startDate}
              disabled={busy}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-end">End</Label>
            <Input
              id="settings-end"
              type="date"
              value={endDate}
              disabled={busy}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>
        <Button
          disabled={busy}
          onClick={() => {
            applyGroupPatchOptimistic({
              group,
              profile,
              body: {
                action: "update-group",
                profileId: profile.id,
                name: name.trim(),
                startDate: startDate.trim() || null,
                endDate: endDate.trim() || null,
              },
              onGroup,
              onError,
              onBusy,
            })
          }}
        >
          Save details
        </Button>
      </CardContent>
    </Card>
  )
}

function TripRosterCard({
  group,
  profile,
  busy,
  onGroup,
  onError,
  onBusy,
  onRefresh,
}: {
  group: Group
  profile: PublicProfile
  busy: boolean
  onGroup: (group: Group) => void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
  onRefresh: () => Promise<void>
}) {
  const [name, setName] = useState("")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Roster</CardTitle>
        <CardDescription>
          Add open nicknames. Travelers claim a seat when they join with the code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1 text-sm">
          {group.members.map((member) => (
            <li key={member.id} className="rounded border px-2 py-1">
              {member.name}
              {member.profileId ? (
                <span className="text-muted-foreground"> · linked</span>
              ) : (
                <span className="text-muted-foreground"> · open</span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="New nickname"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={busy || !name.trim()}
            onClick={() => {
              applyGroupPatchOptimistic({
                group,
                profile,
                body: { action: "add-member", name: name.trim(), profileId: profile.id },
                onGroup,
                onError,
                onBusy,
                refresh: onRefresh,
                onDone: () => setName(""),
              })
            }}
          >
            Add seat
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function TripAdminsCard({
  group,
  profile,
  busy,
  onGroup,
  onError,
  onBusy,
}: {
  group: Group
  profile: PublicProfile
  busy: boolean
  onGroup: (group: Group) => void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  const linked = group.members.filter((member) => member.profileId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trip admins</CardTitle>
        <CardDescription>
          Admins can change settings, add roster seats, and manage invites. The trip creator
          is always an admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No linked profiles yet. Admins need a claimed seat with a signed-in profile.
          </p>
        ) : (
          linked.map((member) => {
            const profileId = member.profileId!
            const isCreator = group.createdByProfileId === profileId
            const isAdmin =
              isCreator || (group.adminProfileIds ?? []).includes(profileId)
            return (
              <label
                key={member.id}
                className="flex items-center gap-2 rounded border px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={isAdmin}
                  disabled={busy || isCreator}
                  onCheckedChange={(checked) => {
                    if (isCreator) return
                    applyGroupPatchOptimistic({
                      group,
                      profile,
                      body: {
                        action: "set-trip-admin",
                        targetProfileId: profileId,
                        isAdmin: checked === true,
                        profileId: profile.id,
                      },
                      onGroup,
                      onError,
                      onBusy,
                    })
                  }}
                />
                <span>
                  {member.name}
                  {isCreator ? (
                    <span className="text-muted-foreground"> · creator</span>
                  ) : null}
                </span>
              </label>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
