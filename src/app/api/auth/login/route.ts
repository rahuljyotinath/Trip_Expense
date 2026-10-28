import { logInWithProfile } from "@/lib/auth-ops"
import {
  isPostgresPasswordAuthError,
  readProfileForLogin,
  resetPostgresClient,
  storageMode,
} from "@/lib/db"
import { POSTGRES_DEPLOY_AUTH_MESSAGE } from "@/lib/postgres-connect"
import { fail, failServiceUnavailable, json, readBody } from "@/lib/http"
import { setSessionProfile } from "@/lib/session"
import { publicProfile } from "@/lib/types"
import { connection } from "next/server"

export async function POST(request: Request) {
  await connection()
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  try {
    const body = await readBody<{ username?: string; password?: string }>(request)
    let profile
    try {
      profile = await readProfileForLogin(body.username ?? "")
    } catch (error) {
      if (isPostgresPasswordAuthError(error)) {
        resetPostgresClient()
        return failServiceUnavailable(POSTGRES_DEPLOY_AUTH_MESSAGE)
      }
      throw error
    }
    const result = logInWithProfile(profile, {
      username: body.username ?? "",
      password: body.password ?? "",
    })
    await setSessionProfile(result.profile.id)
    return json({ profile: publicProfile(result.profile) })
  } catch (error) {
    return fail(error)
  }
}
