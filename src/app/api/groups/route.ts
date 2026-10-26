import { readStore, storageMode, updateStore } from "@/lib/db"
import { fail, json, readBody } from "@/lib/http"
import { createGroup, groupByCode, groupsForProfile } from "@/lib/operations"

export async function GET(request: Request) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const url = new URL(request.url)
  const profileId = url.searchParams.get("profileId")
  const code = url.searchParams.get("code")
  try {
    const store = await readStore()
    if (code) {
      const group = groupByCode(store, code)
      if (!group) return json({ error: "No trip uses that code." }, 404)
      return json({ group })
    }
    if (!profileId) return json({ error: "profileId or code required." }, 400)
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
    const body = await readBody<{
      name?: string
      currency?: string
      startDate?: string | null
      endDate?: string | null
      memberNames?: string[]
      createdByProfileId?: string
    }>(request)
    const result = await updateStore((store) =>
      createGroup(store, {
        name: body.name ?? "",
        currency: body.currency,
        startDate: body.startDate,
        endDate: body.endDate,
        memberNames: body.memberNames ?? [],
        createdByProfileId: body.createdByProfileId ?? "",
      })
    )
    return json({ group: result.group })
  } catch (error) {
    return fail(error)
  }
}
