import { ApiError, fail, json, readBody } from "@/lib/http"
import { limitAuth } from "@/lib/auth-rate-limit"
import { authenticateCurrentPassword, replacePassword } from "@/lib/password-service"
import { sessionProfileId, setSessionProfile } from "@/lib/session"

export async function POST(request: Request) {
  try {
    const id = await sessionProfileId()
    if (!id) throw new ApiError("Sign in again.", 401, "UNAUTHORIZED")
    const body = await readBody<{ currentPassword: string; newPassword: string }>(request)
    await limitAuth(request, "password", id)
    const profile = await authenticateCurrentPassword(id, body.currentPassword ?? "")
    const recoveryCode = await replacePassword(profile, body.newPassword ?? "")
    const sessionToken = await setSessionProfile(id)
    return json({ ok: true, recoveryCode, sessionToken })
  } catch (error) { return fail(error) }
}
