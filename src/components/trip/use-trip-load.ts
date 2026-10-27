"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { profileNeedsSetup } from "@/lib/auth-ops"
import {
  fetchGroup,
  fetchSessionProfile,
  loadHealth,
  syncProfileToLocalStore,
  type Health,
} from "@/lib/client-api"
import type { Group, PublicProfile } from "@/lib/types"

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "That failed."
}

export function useTripLoad(groupId: string, tripPath: string) {
  const router = useRouter()
  const [health, setHealth] = useState<Health | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!groupId) return

    let cancelled = false

    ;(async () => {
      setLoading(true)
      setLoadError(null)
      setGroup(null)
      try {
        const [nextHealth, session, nextGroup] = await Promise.all([
          loadHealth(),
          fetchSessionProfile(),
          fetchGroup(groupId, { skipHealth: true }),
        ])
        if (cancelled) return
        setHealth(nextHealth)
        if (session?.id && session.username) {
          if (profileNeedsSetup(session)) {
            router.replace(
              `/profile/setup?next=${encodeURIComponent(tripPath)}`
            )
            return
          }
          setProfile(session)
          syncProfileToLocalStore(session)
        } else {
          setProfile(null)
        }
        setGroup(nextGroup)
      } catch (err) {
        if (!cancelled) setLoadError(errorText(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, router, tripPath])

  async function refreshGroup() {
    if (!groupId) return null
    const next = await fetchGroup(groupId)
    setGroup(next)
    return next
  }

  return {
    health,
    profile,
    group,
    setGroup,
    loadError,
    loading,
    refreshGroup,
  }
}
