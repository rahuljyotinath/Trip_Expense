/** Canonical app origin for invite links (set NEXT_PUBLIC_APP_URL in production). */
export function publicAppUrl(fallbackOrigin?: string) {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "")
  if (fromEnv) return fromEnv
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin
  }
  return fallbackOrigin?.replace(/\/$/, "") ?? ""
}
