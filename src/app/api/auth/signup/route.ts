import { signUp } from "@/lib/auth-ops"
import { storageMode, updateStore } from "@/lib/db"
import { fail, json, readBody } from "@/lib/http"
import { setSessionProfile } from "@/lib/session"
import { publicProfile } from "@/lib/types"
import { connection } from "next/server"

export async function POST(request: Request) {
  await connection()
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  try {
    const body = await readBody<{
      username?: string
      password?: string
      name?: string
    }>(request)
    const result = await updateStore(
      (store) =>
        signUp(store, {
          username: body.username ?? "",
          password: body.password ?? "",
          name: body.name,
        }),
      { scope: { kind: "createTrip" } }
    )
    await setSessionProfile(result.profile.id)
    return json({ profile: publicProfile(result.profile) })
  } catch (error) {
    return fail(error)
  }
}
