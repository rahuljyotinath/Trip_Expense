import { readStore, storageMode, updateStore } from "@/lib/db"
import { fail, json, readBody } from "@/lib/http"
import { createProfile } from "@/lib/operations"

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
    return json({ profile })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  try {
    const body = await readBody<{ name?: string }>(request)
    const result = await updateStore((store) => createProfile(store, body.name ?? ""))
    return json({ profile: result.profile })
  } catch (error) {
    return fail(error)
  }
}
