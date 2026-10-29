import { normalizeUsername } from "@/lib/auth-validation"

export function profilePublicHref(rawUsername: string) {
  const username = normalizeUsername(rawUsername)
  if (!username) return "/"
  return `/profile/${encodeURIComponent(username)}`
}
