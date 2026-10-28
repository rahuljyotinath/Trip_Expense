import { profileFromId } from "@/lib/auth-ops"
import {
  readGroupByCode,
  readGroupsForProfile,
  readStoreLedgerMeta,
  storageMode,
  updateStore,
} from "@/lib/db"
import { fail, json, readBody } from "@/lib/http"
import { connection } from "next/server"
import { sessionProfileId } from "@/lib/session"
import { joinRequestForProfile } from "@/lib/trip-invites"
import { createGroup } from "@/lib/operations"
import { emptyStore } from "@/lib/types"

export async function GET(request: Request) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const sessionId = await sessionProfileId()
  if (!sessionId) {
    return json({ error: "Sign in again." }, 401)
  }
  const url = new URL(request.url)
  const profileId = url.searchParams.get("profileId")
  const code = url.searchParams.get("code")
  try {
    await connection()
    if (code) {
      const group = await readGroupByCode(code)
      if (!group) return json({ error: "No trip uses that code." }, 404)
      const meta = await readStoreLedgerMeta()
      const store = { ...emptyStore(), groups: [group], joinRequests: meta.joinRequests }
      const joinRequest = joinRequestForProfile(store, group.id, sessionId)
      return json({ group, joinRequest })
    }
    if (!profileId) return json({ error: "profileId or code required." }, 400)
    if (profileId !== sessionId) {
      return json({ error: "Forbidden." }, 403)
    }
    return json({ groups: await readGroupsForProfile(profileId) })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  try {
    const sessionId = await sessionProfileId()
    if (!sessionId) {
      return json({ error: "Sign in again." }, 401)
    }
    const body = await readBody<{
      name?: string
      currency?: string
      startDate?: string | null
      endDate?: string | null
      memberNames?: string[]
      createdByProfileId?: string
    }>(request)
    const result = await updateStore(
      (store) => {
      if (!profileFromId(store, sessionId)) {
        throw new Error("Sign in again — your account is not on the ledger.")
      }
      return createGroup(store, {
        name: body.name ?? "",
        currency: body.currency,
        startDate: body.startDate,
        endDate: body.endDate,
        memberNames: body.memberNames ?? [],
        createdByProfileId: sessionId,
      })
    },
      { scope: { kind: "createTrip" } }
    )
    return json({ group: result.group })
  } catch (error) {
    return fail(error)
  }
}
