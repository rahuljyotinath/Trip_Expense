import { profileFromId } from "@/lib/auth-ops"
import { readStore, storageMode } from "@/lib/db"
import { fail, json } from "@/lib/http"
import { sessionProfileId } from "@/lib/session"
import { publicProfile } from "@/lib/types"

export async function GET() {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  try {
    const profileId = await sessionProfileId()
    if (!profileId) return json({ profile: null })
    const store = await readStore()
    const profile = profileFromId(store, profileId)
    if (!profile || !profile.passwordHash) return json({ profile: null })
    return json({ profile: publicProfile(profile) })
  } catch (error) {
    return fail(error)
  }
}
