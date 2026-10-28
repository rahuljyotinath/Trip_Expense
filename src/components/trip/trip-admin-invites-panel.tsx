"use client"

import { ProfileLink } from "@/components/profile/profile-link"
import { applyGroupPatchOptimistic } from "@/lib/group-patch-optimistic"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { KnownContact, PendingJoinRequestRow } from "@/lib/client-api"
import type { Group, PublicProfile, TripInvite } from "@/lib/types"
import { useEffect, useState } from "react"
import { TripJoinLinkActions } from "@/components/trip/trip-join-link-actions"
import { fetchKnownContacts } from "@/lib/client-api"

export function TripAdminInvitesPanel({
  group,
  profile,
  busy,
  pendingTripInvites,
  pendingJoinRequests,
  onGroup,
  onError,
  onBusy,
  onRefresh,
}: {
  group: Group
  profile: PublicProfile
  busy: boolean
  pendingTripInvites: TripInvite[]
  pendingJoinRequests: PendingJoinRequestRow[]
  onGroup: (group: Group) => void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
  onRefresh: () => Promise<void>
}) {
  const [knownContacts, setKnownContacts] = useState<KnownContact[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [invitePhone, setInvitePhone] = useState("")
  const [inviteContactId, setInviteContactId] = useState("")
  const [inviteTargetProfileId, setInviteTargetProfileId] = useState("")

  useEffect(() => {
    void fetchKnownContacts()
      .then(setKnownContacts)
      .catch(() => setKnownContacts([]))
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invites & join requests</CardTitle>
        <CardDescription>
          Invite by email or phone, and approve join requests when join approval is on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TripJoinLinkActions group={group} />
        {knownContacts.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="invite-contact">From contacts</Label>
            <select
              id="invite-contact"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              value={inviteContactId}
              disabled={busy}
              onChange={(event) => {
                const id = event.target.value
                setInviteContactId(id)
                const picked = knownContacts.find((item) => item.id === id)
                if (picked) {
                  setInviteTargetProfileId(picked.id)
                  setInviteEmail("")
                  setInvitePhone("")
                } else {
                  setInviteTargetProfileId("")
                }
              }}
            >
              <option value="">Pick someone…</option>
              {knownContacts.map((contact) => (
                <option key={contact.contactId} value={contact.id}>
                  {contact.name}
                  {contact.username ? ` (@${contact.username})` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Email or @username"
            value={inviteEmail}
            disabled={busy}
            onChange={(event) => {
              setInviteEmail(event.target.value)
              setInviteContactId("")
              setInviteTargetProfileId("")
            }}
          />
          <Input
            placeholder="Phone"
            value={invitePhone}
            disabled={busy}
            onChange={(event) => {
              setInvitePhone(event.target.value)
              setInviteContactId("")
              setInviteTargetProfileId("")
            }}
          />
        </div>
        <Button
          size="sm"
          disabled={
            busy ||
            (!inviteTargetProfileId && !inviteEmail.trim() && !invitePhone.trim())
          }
          onClick={() => {
            applyGroupPatchOptimistic({
              group,
              profile,
              body: {
                action: "send-trip-invite",
                email: inviteEmail.trim() || null,
                phone: invitePhone.trim() || null,
                targetProfileId: inviteTargetProfileId || null,
                profileId: profile.id,
              },
              onGroup,
              onError,
              onBusy,
              refresh: onRefresh,
              onDone: () => {
                setInviteEmail("")
                setInvitePhone("")
                setInviteContactId("")
                setInviteTargetProfileId("")
              },
            })
          }}
        >
          Send invite
        </Button>
        {pendingTripInvites.length > 0 ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Pending invites</p>
            {pendingTripInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-2 rounded border px-2 py-1"
              >
                <span className="truncate text-muted-foreground">
                  {invite.invitedEmail ?? invite.invitedPhone ?? "—"}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() => {
                    applyGroupPatchOptimistic({
                      group,
                      profile,
                      body: {
                        action: "revoke-trip-invite",
                        inviteId: invite.id,
                        profileId: profile.id,
                      },
                      onGroup,
                      onError,
                      onBusy,
                      refresh: onRefresh,
                    })
                  }}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        {pendingJoinRequests.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Join requests</p>
            {pendingJoinRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-2 text-sm"
              >
                <span>
                  {request.profileUsername ? (
                    <ProfileLink username={request.profileUsername}>
                      {request.profileName ?? "Traveler"}
                    </ProfileLink>
                  ) : (
                    (request.profileName ?? "Traveler")
                  )}
                </span>
                <span className="flex gap-1">
                  <Button
                    size="xs"
                    disabled={busy}
                    onClick={() => {
                      applyGroupPatchOptimistic({
                        group,
                        profile,
                        body: {
                          action: "approve-join-request",
                          requestId: request.id,
                          profileId: profile.id,
                        },
                        onGroup,
                        onError,
                        onBusy,
                        refresh: onRefresh,
                      })
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      applyGroupPatchOptimistic({
                        group,
                        profile,
                        body: {
                          action: "reject-join-request",
                          requestId: request.id,
                          profileId: profile.id,
                        },
                        onGroup,
                        onError,
                        onBusy,
                        refresh: onRefresh,
                      })
                    }}
                  >
                    Reject
                  </Button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
