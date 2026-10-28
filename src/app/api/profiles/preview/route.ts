import { readProfileForContactSearch, storageMode } from "@/lib/db"
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
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (!q) {
    return json({ profile: null })
  }
  try {
    await connection()
    const match = await readProfileForContactSearch(q)
    if (!match?.username?.trim()) {
      return json({ profile: null })
    }
    return json({ profile: publicProfileView(match) })
  } catch (error) {
    return fail(error)
  }
}
