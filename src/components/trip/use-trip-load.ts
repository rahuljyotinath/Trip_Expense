"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { profileNeedsSetup } from "@/lib/auth-validation"
import {
  cachedGroupById,
  drainGroupOutbox,
  fetchGroupDetail,
  fetchSessionProfile,
  isNetworkError,
  loadSavedProfile,
  startOfflineOutboxSync,
  syncProfileToLocalStore,
  type Health,
} from "@/lib/client-api"
import type {
  Group,
  LinkedTripProfile,
  PublicProfile,
  TripInvite,
} from "@/lib/types"
import type { PendingJoinRequestRow } from "@/lib/client-api"
import { tripAuthReturnPath } from "@/lib/trip-invite-url"

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "That failed."
}

export function useTripLoad(groupId: string, tripPath: string) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const joinCode = (searchParams.get("join") ?? "").trim().toUpperCase() || null

  const health: Health | null = null
  const [profile, setProfile] = useState<PublicProfile | null>(() =>
    typeof window === "undefined" ? null : loadSavedProfile()
  )
  const [group, setGroup] = useState<Group | null>(() =>
    groupId ? cachedGroupById(groupId) : null
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(() =>
    groupId ? !cachedGroupById(groupId) : true
  )
  const [fromCache, setFromCache] = useState(() =>
    groupId ? Boolean(cachedGroupById(groupId)) : false
  )
  const [pendingJoinRequests, setPendingJoinRequests] = useState<
    PendingJoinRequestRow[]
  >([])
  const [pendingTripInvites, setPendingTripInvites] = useState<TripInvite[]>([])
  const [linkedProfiles, setLinkedProfiles] = useState<LinkedTripProfile[]>([])
  const [viewerTripInvite, setViewerTripInvite] = useState<TripInvite | null>(
    null
  )

  useEffect(() => {
    startOfflineOutboxSync()
  }, [])

  useEffect(() => {
    if (!groupId) return

    let cancelled = false
    ;(async () => {
      try {
        const [session, detail] = await Promise.all([
          fetchSessionProfile(),
          fetchGroupDetail(groupId, { skipHealth: true, joinCode }),
        ])
        if (cancelled) return
        if (!session?.id || !session.username) {
          const next = tripAuthReturnPath(tripPath, joinCode)
          router.replace(`/login?next=${encodeURIComponent(next)}`)
          return
        }
        if (profileNeedsSetup(session)) {
          router.replace(
            `/profile/setup?next=${encodeURIComponent(tripAuthReturnPath(tripPath, joinCode))}`
          )
          return
        }
        setProfile(session)
        syncProfileToLocalStore(session)
        setGroup(detail.group)
        setPendingJoinRequests(detail.pendingJoinRequests)
        setPendingTripInvites(detail.pendingTripInvites)
        setLinkedProfiles(detail.linkedProfiles)
        setViewerTripInvite(detail.viewerTripInvite)
        setFromCache(false)
      } catch (err) {
        if (cancelled) return
        const fallback = isNetworkError(err) ? cachedGroupById(groupId) : null
        if (fallback) {
          setGroup(fallback)
          setFromCache(true)
          return
        }
        setLoadError(errorText(err))
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
      void fetchGroupDetail(groupId, { joinCode })
        .then((detail) => {
          setGroup(detail.group)
          setPendingJoinRequests(detail.pendingJoinRequests)
          setPendingTripInvites(detail.pendingTripInvites)
          setLinkedProfiles(detail.linkedProfiles)
          setViewerTripInvite(detail.viewerTripInvite)
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
    const detail = await fetchGroupDetail(groupId, { joinCode })
    setGroup(detail.group)
    setPendingJoinRequests(detail.pendingJoinRequests)
    setPendingTripInvites(detail.pendingTripInvites)
    setLinkedProfiles(detail.linkedProfiles)
    setViewerTripInvite(detail.viewerTripInvite)
    setFromCache(false)
    return detail.group
  }

  return {
    health,
    profile,
    group,
    setGroup,
    loadError,
    loading,
    fromCache,
    pendingJoinRequests,
    pendingTripInvites,
    linkedProfiles,
    viewerTripInvite,
    refreshGroup,
  }
}
