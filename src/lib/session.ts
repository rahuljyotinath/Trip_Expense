import { cookies, headers } from "next/headers"
import { createSessionToken, readSessionToken, sessionCookie } from "@/lib/auth-crypto"

function sessionIdFromAuthorization(value: string | null) {
  if (!value?.startsWith("Bearer ")) return null
  return readSessionToken(value.slice("Bearer ".length).trim())
}

export async function setSessionProfile(profileId: string) {
  const jar = await cookies()
  jar.set(sessionCookie.name, createSessionToken(profileId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionCookie.maxAge,
  })
}

export async function clearSession() {
  const jar = await cookies()
  jar.delete(sessionCookie.name)
}

export async function sessionProfileId() {
  const headerList = await headers()
  const fromBearer = sessionIdFromAuthorization(headerList.get("authorization"))
  if (fromBearer) return fromBearer
  const jar = await cookies()
  return readSessionToken(jar.get(sessionCookie.name)?.value)
}
