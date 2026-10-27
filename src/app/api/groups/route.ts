import { profileFromId } from "@/lib/auth-ops"
import { readStore, storageMode, updateStore } from "@/lib/db"
import { fail, json, readBody } from "@/lib/http"
import { connection } from "next/server"
import { sessionProfileId } from "@/lib/session"
import { joinRequestForProfile } from "@/lib/trip-invites"
import { createGroup, groupByCode, groupsForProfile } from "@/lib/operations"

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
    const store = await readStore()
    if (code) {
      const group = groupByCode(store, code)
      if (!group) return json({ error: "No trip uses that code." }, 404)
      const joinRequest = joinRequestForProfile(store, group.id, sessionId)
      return json({ group, joinRequest })
    }
    if (!profileId) return json({ error: "profileId or code required." }, 400)
    if (profileId !== sessionId) {
      return json({ error: "Forbidden." }, 403)
    }
    return json({ groups: groupsForProfile(store, profileId) })
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
    const result = await updateStore((store) => {
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
    })
    return json({ group: result.group })
  } catch (error) {
    return fail(error)
  }
}
