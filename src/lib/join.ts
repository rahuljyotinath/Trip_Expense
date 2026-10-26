/** Parse invite URL or raw trip code for lookup. */
export function parseJoinInput(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  try {
    const url = new URL(trimmed)
    const join = url.searchParams.get("join")
    if (join) return join.toUpperCase()
  } catch {
    /* not a URL */
  }
  return trimmed.toUpperCase().replace(/\s/g, "")
}
