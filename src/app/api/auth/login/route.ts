import {
  isPostgresPasswordAuthError,
  readProfileForLogin,
  resetPostgresClient,
  storageMode,
} from "@/lib/db"
import { POSTGRES_DEPLOY_AUTH_MESSAGE } from "@/lib/postgres-connect"
import { fail, failServiceUnavailable, json, readBody } from "@/lib/http"
import { verifyPasswordAsync } from "@/lib/auth-crypto"
import { setSessionProfile } from "@/lib/session"
import { publicProfile } from "@/lib/types"
import { limitAuth } from "@/lib/auth-rate-limit"
import { ApiError } from "@/lib/http"
import { connection } from "next/server"

export async function POST(request: Request) {
  await connection()
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  try {
    const body = await readBody<{ username?: string; password?: string }>(request)
    await limitAuth(request, "login", body.username)
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
    const dummy = `scrypt$32768$8$3$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`
    const verified = await verifyPasswordAsync(body.password ?? "", profile?.passwordHash || dummy)
    if (!verified || !profile?.passwordHash) throw new ApiError("Unknown username or wrong password.", 401, "INVALID_CREDENTIALS")
    const sessionToken = await setSessionProfile(profile.id)
    return json({
      profile: publicProfile(profile),
      sessionToken,
    })
  } catch (error) {
    return fail(error)
  }
}
