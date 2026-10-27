import { normalizeUsername } from "@/lib/auth-ops"

export function profilePublicHref(rawUsername: string) {
  const username = normalizeUsername(rawUsername)
  if (!username) return "/"
  return `/profile/${encodeURIComponent(username)}`
}
