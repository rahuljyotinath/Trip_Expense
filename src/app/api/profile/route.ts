import { updateProfile } from "@/lib/auth-ops"
import { readProfileForSession, storageMode, updateStore } from "@/lib/db"
import { fail, json, readBody } from "@/lib/http"
import { sessionProfileId } from "@/lib/session"
import { publicProfile } from "@/lib/types"

export async function GET() {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  try {
    const profileId = await sessionProfileId()
    if (!profileId) return json({ profile: null })
    const profile = await readProfileForSession(profileId)
    if (!profile || !profile.passwordHash) return json({ profile: null })
    return json({ profile: publicProfile(profile) })
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(request: Request) {
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
      email?: string | null
      phone?: string | null
    }>(request)
    const result = await updateStore(
      (store) =>
        updateProfile(store, {
          profileId: sessionId,
          name: body.name,
          email: body.email,
          phone: body.phone,
        }),
      { scope: { kind: "createTrip" } }
    )
    return json({ profile: publicProfile(result.profile) })
  } catch (error) {
    return fail(error)
  }
}
