/** Same-origin in-app path only (blocks open redirects). */
export function safeReturnPath(raw: string | null | undefined, fallback = "/") {
  const value = (raw ?? "").trim()
  if (!value.startsWith("/") || value.startsWith("//")) return fallback
  return value
}

export function withQueryParam(path: string, key: string, value: string) {
  const sep = path.includes("?") ? "&" : "?"
  return `${path}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}
