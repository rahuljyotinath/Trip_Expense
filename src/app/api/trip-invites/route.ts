import { readStore, storageMode } from "@/lib/db"
import { fail, json } from "@/lib/http"
import { connection } from "next/server"
import { sessionProfileId } from "@/lib/session"
import { acceptTripInvite, declineTripInvite } from "@/lib/operations"
import { groupNameById, pendingInvitesForProfile } from "@/lib/trip-invites"
import { profileFromId } from "@/lib/auth-ops"
import { publicProfile } from "@/lib/types"
import { readBody } from "@/lib/http"
import { updateStore } from "@/lib/db"

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
    const store = await readStore()
    const profile = profileFromId(store, sessionId)
    if (!profile) return json({ error: "Sign in again." }, 401)
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
    const result = await updateStore((store) => {
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
    })
    return json({ group: result.group })
  } catch (error) {
    return fail(error)
  }
}
