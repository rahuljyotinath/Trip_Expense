import { logIn } from "@/lib/auth-ops"
import { storageMode, updateStore } from "@/lib/db"
import { fail, json, readBody } from "@/lib/http"
import { setSessionProfile } from "@/lib/session"
import { publicProfile } from "@/lib/types"

export async function POST(request: Request) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  try {
    const body = await readBody<{ username?: string; password?: string }>(request)
    const result = await updateStore((store) =>
      logIn(store, {
        username: body.username ?? "",
        password: body.password ?? "",
      })
    )
    await setSessionProfile(result.profile.id)
    return json({ profile: publicProfile(result.profile) })
  } catch (error) {
    return fail(error)
  }
}
