import { findProfileByUsername } from "@/lib/auth-ops"
import { readStore, storageMode } from "@/lib/db"
import { fail, json } from "@/lib/http"
import { publicProfileView } from "@/lib/types"
import { sessionProfileId } from "@/lib/session"
import { connection } from "next/server"

export async function GET(request: Request) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const sessionId = await sessionProfileId()
  if (!sessionId) {
    return json({ error: "Sign in again." }, 401)
  }
  const username = new URL(request.url).searchParams.get("username")?.trim() ?? ""
  if (!username) {
    return json({ error: "Username required." }, 400)
  }
  try {
    await connection()
    const store = await readStore()
    const profile = findProfileByUsername(store, username)
    if (!profile) {
      return json({ error: "Profile not found." }, 404)
    }
    return json({ profile: publicProfileView(profile) })
  } catch (error) {
    return fail(error)
  }
}
