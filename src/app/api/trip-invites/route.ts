import {
  readProfileForSession,
  readStoreForTripInvites,
  readStoreLedgerMeta,
  storageMode,
} from "@/lib/db"
import { fail, json } from "@/lib/http"
import { connection } from "next/server"
import { sessionProfileId } from "@/lib/session"
import { acceptTripInvite, declineTripInvite } from "@/lib/operations"
import { groupNameById, pendingInvitesForProfile } from "@/lib/trip-invites"
import { publicProfile } from "@/lib/types"
import { readBody } from "@/lib/http"
import { updateStore } from "@/lib/db"
import { tripJoinPreview } from "@/lib/trip-access"

export async function GET() {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const sessionId = await sessionProfileId()
  if (!sessionId) {
    return json({ error: "Sign in again." }, 401)
  }
  try {
    await connection()
    const profile = await readProfileForSession(sessionId)
    if (!profile) return json({ error: "Sign in again." }, 401)
    const store = await readStoreForTripInvites(profile)
    const invites = pendingInvitesForProfile(store, publicProfile(profile)).map((invite) => ({
      ...invite,
      tripName: groupNameById(store, invite.groupId),
    }))
    return json({ invites })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const sessionId = await sessionProfileId()
  if (!sessionId) {
    return json({ error: "Sign in again." }, 401)
  }
  try {
    const body = await readBody<{ action?: string; inviteId?: string }>(request)
    const meta = await readStoreLedgerMeta()
    const invite = (meta.tripInvites ?? []).find((item) => item.id === body.inviteId)
    const scope = invite
      ? ({ kind: "trip", tripId: invite.groupId } as const)
      : ({ kind: "createTrip" } as const)
    const result = await updateStore(
      (store) => {
      if (body.action === "accept") {
        return acceptTripInvite(store, {
          inviteId: body.inviteId ?? "",
          profileId: sessionId,
        })
      }
      if (body.action === "decline") {
        const declined = declineTripInvite(store, {
          inviteId: body.inviteId ?? "",
          profileId: sessionId,
        })
        const invite = (declined.store.tripInvites ?? []).find(
          (item) => item.id === body.inviteId
        )
        const group = invite
          ? declined.store.groups.find((item) => item.id === invite.groupId)
          : null
        if (!group) throw new Error("Invite not found.")
        return { store: declined.store, group }
      }
      throw new Error("Unknown action.")
    },
      { scope }
    )
    return json({ group: body.action === "accept"
      ? tripJoinPreview(result.group, sessionId, result.store.joinRequests) : null })
  } catch (error) {
    return fail(error)
  }
}
