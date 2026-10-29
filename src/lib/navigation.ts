/** Same-origin in-app path only (blocks open redirects). */
export function safeReturnPath(raw: string | null | undefined, fallback = "/") {
  const value = (raw ?? "").trim()
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback
  try {
    const base = "https://tripzy.invalid"
    const url = new URL(value, base)
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback
  } catch { return fallback }
}

export function withQueryParam(path: string, key: string, value: string) {
  const sep = path.includes("?") ? "&" : "?"
  return `${path}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}
