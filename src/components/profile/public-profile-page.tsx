"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AuthChrome } from "@/components/profile/auth-chrome"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { fetchPublicProfileByUsername, fetchSessionProfile } from "@/lib/client-api"
import type { PublicProfileView } from "@/lib/types"

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "That failed."
}

export function PublicProfilePage() {
  const params = useParams()
  const raw = params.username
  const username = Array.isArray(raw) ? raw[0] ?? "" : String(raw ?? "")
  const router = useRouter()
  const [profile, setProfile] = useState<PublicProfileView | null>(null)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const session = await fetchSessionProfile()
        if (!session?.id) {
          router.replace(`/login?next=${encodeURIComponent(`/profile/${username}`)}`)
          return
        }
        if (cancelled) return
        setViewerId(session.id)
        const viewed = await fetchPublicProfileByUsername(username)
        if (cancelled) return
        setProfile(viewed)
      } catch (err) {
        if (!cancelled) setError(errorText(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [username, router])

  const isSelf = profile && viewerId && profile.id === viewerId

  return (
    <AuthChrome title="Profile">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <Card>
          <CardHeader>
            <CardTitle>Not found</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/"
              className="inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-sm"
            >
              Back home
            </Link>
          </CardContent>
        </Card>
      ) : profile ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-3xl">{profile.name}</CardTitle>
            <CardDescription>@{profile.username}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-sm"
            >
              Home
            </Link>
            {isSelf ? (
              <Link
                href="/profile/setup"
                className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm text-primary-foreground"
              >
                Edit your profile
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </AuthChrome>
  )
}
