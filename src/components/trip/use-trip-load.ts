"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { profileNeedsSetup } from "@/lib/auth-ops"
import {
  cachedGroupById,
  drainGroupOutbox,
  fetchGroup,
  fetchSessionProfile,
  isNetworkError,
  loadHealth,
  startOfflineOutboxSync,
  syncProfileToLocalStore,
  type Health,
} from "@/lib/client-api"
import type { Group, PublicProfile } from "@/lib/types"

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "That failed."
}

export function useTripLoad(groupId: string, tripPath: string) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const joinCode = (searchParams.get("join") ?? "").trim().toUpperCase() || null

  const [health, setHealth] = useState<Health | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    startOfflineOutboxSync()
  }, [])

  useEffect(() => {
    if (!groupId) return

    let cancelled = false

    ;(async () => {
      setLoading(true)
      setLoadError(null)
      setFromCache(false)
      setGroup(null)
      try {
        const [nextHealth, session] = await Promise.all([
          loadHealth(),
          fetchSessionProfile(),
        ])
        if (cancelled) return
        setHealth(nextHealth)
        if (!session?.id || !session.username) {
          const next = joinCode
            ? `${tripPath.split("/analytics")[0]}?join=${encodeURIComponent(joinCode)}`
            : tripPath
          router.replace(`/login?next=${encodeURIComponent(next)}`)
          return
        }
        if (profileNeedsSetup(session)) {
          router.replace(
            `/profile/setup?next=${encodeURIComponent(tripPath)}`
          )
          return
        }
        setProfile(session)
        syncProfileToLocalStore(session)
        try {
          const nextGroup = await fetchGroup(groupId, {
            skipHealth: true,
            joinCode,
          })
          if (cancelled) return
          setGroup(nextGroup)
          setFromCache(false)
        } catch (err) {
          if (cancelled) return
          const cached = isNetworkError(err) ? cachedGroupById(groupId) : null
          if (cached) {
            setGroup(cached)
            setFromCache(true)
            return
          }
          setLoadError(errorText(err))
        }
      } catch (err) {
        if (!cancelled) setLoadError(errorText(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, joinCode, router, tripPath])

  useEffect(() => {
    function onOnline() {
      void drainGroupOutbox()
      if (!groupId) return
      void fetchGroup(groupId, { joinCode })
        .then((next) => {
          setGroup(next)
          setFromCache(false)
        })
        .catch(() => {
          /* keep cached */
        })
    }
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [groupId, joinCode])

  async function refreshGroup() {
    if (!groupId) return null
    const next = await fetchGroup(groupId, { joinCode })
    setGroup(next)
    setFromCache(false)
    return next
  }

  return {
    health,
    profile,
    group,
    setGroup,
    loadError,
    loading,
    fromCache,
    refreshGroup,
  }
}
