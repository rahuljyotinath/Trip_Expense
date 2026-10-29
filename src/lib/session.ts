import { cookies, headers } from "next/headers"
import { createSessionToken, readSessionPayload, sessionCookie } from "@/lib/auth-crypto"
import { activeSessionProfile, registerSession, revokeSession } from "./security-store"

export async function setSessionProfile(profileId: string) {
  const token = createSessionToken(profileId)
  await registerSession(token, profileId, Date.now() + sessionCookie.maxAge * 1000)
  const jar = await cookies()
  jar.set(sessionCookie.name, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: sessionCookie.maxAge })
  return token
}

export async function clearSession() {
  const jar = await cookies(); const headerList = await headers()
  const bearer = headerList.get("authorization")?.match(/^Bearer (.+)$/)?.[1]
  const cookie = jar.get(sessionCookie.name)?.value
  for (const token of new Set([bearer, cookie])) if (token && readSessionPayload(token)) await revokeSession(token)
  jar.delete(sessionCookie.name)
}

export async function sessionProfileId() {
  const headerList = await headers(); const authorization = headerList.get("authorization")
  const token = authorization ? authorization.match(/^Bearer (.+)$/)?.[1] : (await cookies()).get(sessionCookie.name)?.value
  if (!token) return null
  const payload = readSessionPayload(token)
  if (!payload) return null
  return await activeSessionProfile(token) === payload.profileId ? payload.profileId : null
}
