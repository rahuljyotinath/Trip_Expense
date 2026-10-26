import { readProfileForSession, storageMode } from "@/lib/db"
import { fail, json } from "@/lib/http"
import { sessionProfileId } from "@/lib/session"
import { publicProfile } from "@/lib/types"
import { connection } from "next/server"

export async function GET() {
  await connection()
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
