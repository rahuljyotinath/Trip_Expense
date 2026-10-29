"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { AlertCircle, ArrowRight } from "lucide-react"
import { AuthChrome } from "@/components/profile/auth-chrome"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  fetchSessionProfile,
  syncProfileToLocalStore,
  updateProfileUser,
} from "@/lib/client-api"
import { safeReturnPath } from "@/lib/navigation"
import { AccountSecurity } from "./account-security"
import type { PublicProfile } from "@/lib/types"

export function ProfileSetupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const join = (searchParams.get("join") ?? "").toUpperCase()
  const returnPath = searchParams.get("next")
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [upiId, setUpiId] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const session = await fetchSessionProfile()
      if (cancelled) return
      if (!session?.id) {
        const login = returnPath
          ? `/login?next=${encodeURIComponent(safeReturnPath(returnPath))}`
          : join
            ? `/login?join=${encodeURIComponent(join)}`
            : "/login"
        router.replace(login)
        return
      }
      setProfile(session)
      setName(session.name === session.username ? "" : session.name)
      setEmail(session.email ?? "")
      setPhone(session.phone ?? "")
      setUpiId(session.upiId ?? "")
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [join, returnPath, router])

  const canSubmit =
    name.trim().length > 0 &&
    (!email.trim() || email.trim().includes("@")) &&
    (!phone.trim() || phone.trim().replace(/\D/g, "").length >= 10)

  async function onSubmit() {
    if (!profile) return
    setBusy(true)
    setError(null)
    try {
      const updated = await updateProfileUser({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        upiId: upiId.trim() || null,
      })
      syncProfileToLocalStore(updated)
      const target = returnPath
        ? safeReturnPath(returnPath)
        : join
          ? `/?join=${encodeURIComponent(join)}`
          : "/"
      router.replace(target)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <AuthChrome title="Set up your profile">
        <p className="text-sm text-muted-foreground">Loading your account…</p>
      </AuthChrome>
    )
  }

  return (
    <AuthChrome title="Set up your profile">
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="font-heading text-3xl">Your profile</CardTitle>
          <CardDescription>
            Required to join trips. We may use email and phone for product updates.
            {profile ? (
              <>
                {" "}
                Signed in as <span className="font-medium">@{profile.username}</span>.
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              autoFocus
              value={name}
              placeholder="Priya Sharma"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email (optional)</Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-phone">Phone (optional)</Label>
            <Input
              id="profile-phone"
              type="tel"
              value={phone}
              autoComplete="tel"
              placeholder="+91 …"
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-upi">UPI ID (optional)</Label>
            <Input
              id="profile-upi"
              value={upiId}
              autoComplete="off"
              placeholder="you@okicici"
              onChange={(event) => setUpiId(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Trip mates can open a prefilled UPI pay link when they settle with you.
            </p>
          </div>
          <Button disabled={busy || !canSubmit} onClick={() => void onSubmit()} size="lg">
            Save profile <ArrowRight />
          </Button>
        </CardContent>
      </Card>
      <AccountSecurity />
    </AuthChrome>
  )
}
