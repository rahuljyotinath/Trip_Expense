import { ApiError } from "./http"
import { consumeRateLimit } from "./security-store"

export async function limitAuth(request: Request, operation: string, username = "") {
  const ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "local").split(",")[0].trim().slice(0, 128)
  const seconds = operation === "signup" ? 3600 : 900
  const allowed = await consumeRateLimit(`${operation}:ip:${ip}`, operation === "signup" ? 10 : 60, seconds)
  const account = !username || await consumeRateLimit(`${operation}:account:${username.trim().toLowerCase()}`, 15, 900)
  if (!allowed || !account) throw new ApiError("Too many attempts. Try again later.", 429, "RATE_LIMITED")
}
