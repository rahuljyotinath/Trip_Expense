import { signUp } from "@/lib/auth-ops"
import {
  isPostgresPasswordAuthError,
  resetPostgresClient,
  storageMode,
  updateStore,
} from "@/lib/db"
import { POSTGRES_DEPLOY_AUTH_MESSAGE } from "@/lib/postgres-connect"
import { fail, failServiceUnavailable, json, readBody } from "@/lib/http"
import { createSessionToken } from "@/lib/auth-crypto"
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
    return json({
      profile: publicProfile(result.profile),
      sessionToken: createSessionToken(result.profile.id),
    })
  } catch (error) {
    if (isPostgresPasswordAuthError(error)) {
      resetPostgresClient()
      return failServiceUnavailable(POSTGRES_DEPLOY_AUTH_MESSAGE)
    }
    return fail(error)
  }
}
