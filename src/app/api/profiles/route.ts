import { readStore, storageMode } from "@/lib/db"
import { fail, json } from "@/lib/http"
import { publicProfile } from "@/lib/types"

export async function GET(request: Request) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return json({ error: "Profile id required." }, 400)
  try {
    const store = await readStore()
    const profile = store.profiles.find((item) => item.id === id)
    if (!profile) return json({ error: "Profile not found." }, 404)
    return json({ profile: publicProfile(profile) })
  } catch (error) {
    return fail(error)
  }
}
