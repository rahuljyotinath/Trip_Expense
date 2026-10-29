import { signUp, validatePassword } from "@/lib/auth-ops"
import {
  isPostgresPasswordAuthError,
  resetPostgresClient,
  storageMode,
  updateStore,
} from "@/lib/db"
import { POSTGRES_DEPLOY_AUTH_MESSAGE } from "@/lib/postgres-connect"
import { fail, failServiceUnavailable, json, readBody } from "@/lib/http"
import { hashPasswordAsync } from "@/lib/auth-crypto"
import { setSessionProfile } from "@/lib/session"
import { publicProfile } from "@/lib/types"
import { issueRecoveryCode } from "@/lib/security-store"
import { limitAuth } from "@/lib/auth-rate-limit"
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
    await limitAuth(request, "signup", body.username)
    validatePassword(body.password ?? "")
    const passwordHash = await hashPasswordAsync(body.password ?? "")
    const result = await updateStore(
      (store) =>
        signUp(store, {
          username: body.username ?? "",
          password: body.password ?? "",
          name: body.name,
        }, passwordHash),
      { scope: { kind: "createTrip" } }
    )
    const recoveryCode = await issueRecoveryCode(result.profile.id)
    const sessionToken = await setSessionProfile(result.profile.id)
    return json({
      profile: publicProfile(result.profile),
      sessionToken, recoveryCode,
    })
  } catch (error) {
    if (isPostgresPasswordAuthError(error)) {
      resetPostgresClient()
      return failServiceUnavailable(POSTGRES_DEPLOY_AUTH_MESSAGE)
    }
    return fail(error)
  }
}
