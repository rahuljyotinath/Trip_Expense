import { readProfileForSession, storageMode } from "@/lib/db"
import { fail, json } from "@/lib/http"
import { sessionProfileId } from "@/lib/session"
import { publicProfile } from "@/lib/types"

export async function GET(request: Request) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const sessionId = await sessionProfileId()
  if (!sessionId) {
    return json({ error: "Sign in again." }, 401)
  }
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return json({ error: "Profile id required." }, 400)
  if (id !== sessionId) {
    return json({ error: "Forbidden." }, 403)
  }
  try {
    const profile = await readProfileForSession(id)
    if (!profile) return json({ error: "Profile not found." }, 404)
    return json({ profile: publicProfile(profile) })
  } catch (error) {
    return fail(error)
  }
}
