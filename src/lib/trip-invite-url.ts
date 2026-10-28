import { withQueryParam } from "@/lib/navigation"

/** In-app path to open a trip with join code (sign-up safe via `next=`). */
export function tripJoinPath(groupId: string, joinCode: string) {
  const code = joinCode.trim().toUpperCase()
  return withQueryParam(`/trip/${groupId}`, "join", code)
}

export function tripJoinUrl(groupId: string, joinCode: string, origin: string) {
  const base = origin.replace(/\/$/, "")
  return `${base}${tripJoinPath(groupId, joinCode)}`
}

/** Preserve join code when redirecting through login or profile setup. */
export function tripAuthReturnPath(tripPath: string, joinCode: string | null) {
  const base = tripPath.replace(/\/(analytics|settings)$/, "")
  if (!joinCode) return base
  return withQueryParam(base, "join", joinCode)
}
