"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { AlertCircle, ArrowRight } from "lucide-react"
import { AuthChrome } from "@/components/profile/auth-chrome"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { profileNeedsSetup } from "@/lib/auth-ops"
import { logInUser } from "@/lib/client-api"
import { safeReturnPath } from "@/lib/navigation"

function returnTarget(searchParams: URLSearchParams) {
  const next = safeReturnPath(searchParams.get("next"), "")
  if (next) return next
  const join = (searchParams.get("join") ?? "").trim()
  if (join) return `/?join=${encodeURIComponent(join.toUpperCase())}`
  return "/"
}

export function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const join = (searchParams.get("join") ?? "").toUpperCase()
  const next = searchParams.get("next")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = username.trim().length > 0 && password.length >= 5

  async function onSubmit() {
    setBusy(true)
    setError(null)
    try {
      const profile = await logInUser({ username, password })
      const target = returnTarget(searchParams)
      if (profileNeedsSetup(profile)) {
        router.replace(
          `/profile/setup?next=${encodeURIComponent(target)}`
        )
        return
      }
      router.replace(target)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.")
    } finally {
      setBusy(false)
    }
  }

  const signupHref = next
    ? `/signup?next=${encodeURIComponent(safeReturnPath(next))}`
    : join
      ? `/signup?join=${encodeURIComponent(join)}`
      : "/signup"

  return (
    <AuthChrome title="Sign in to your ledger profile">
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>Could not sign in</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="font-heading text-3xl">Sign in</CardTitle>
          <CardDescription>Username and password — no email required.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-username">Username</Label>
            <Input
              id="login-username"
              autoFocus
              value={username}
              autoComplete="username"
              placeholder="priya_k"
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSubmit) void onSubmit()
              }}
            />
          </div>
          <Button disabled={busy || !canSubmit} onClick={() => void onSubmit()} size="lg">
            Sign in <ArrowRight />
          </Button>
          <p className="text-sm text-muted-foreground">
            New here?{" "}
            <Link href={signupHref} className="text-foreground underline underline-offset-4">
              Create a profile
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthChrome>
  )
}
