import { ApiError, fail, json, readBody } from "@/lib/http"
import { limitAuth } from "@/lib/auth-rate-limit"
import { readProfileForLogin } from "@/lib/db"
import { replacePassword } from "@/lib/password-service"

export async function POST(request: Request) {
  try {
    const body = await readBody<{ username: string; recoveryCode: string; newPassword: string }>(request)
    await limitAuth(request, "recovery", body.username ?? "")
    const profile = await readProfileForLogin(body.username ?? "")
    if (!profile) throw new ApiError("Recovery code or username is incorrect.", 401, "INVALID_CREDENTIALS")
    const recoveryCode = await replacePassword(profile, body.newPassword ?? "", body.recoveryCode ?? "")
    return json({ ok: true, recoveryCode })
  } catch (error) { return fail(error) }
}
