import { cookies } from "next/headers"
import { createSessionToken, readSessionToken, sessionCookie } from "@/lib/auth-crypto"

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
  const jar = await cookies()
  return readSessionToken(jar.get(sessionCookie.name)?.value)
}
