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
import { signUpUser } from "@/lib/client-api"
import { safeReturnPath } from "@/lib/navigation"

export function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const join = (searchParams.get("join") ?? "").toUpperCase()
  const next = searchParams.get("next")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = username.trim().length > 0 && password.length >= 5
  const joiningTrip = Boolean(next?.includes("/trip/") || join)

  async function onSubmit() {
    setBusy(true)
    setError(null)
    try {
      await signUpUser({ username, password })
      const target = next
        ? safeReturnPath(next)
        : join
          ? `/?join=${encodeURIComponent(join)}`
          : "/"
      const setupQuery = join && !next
        ? `?next=${encodeURIComponent(target)}&join=${encodeURIComponent(join)}`
        : `?next=${encodeURIComponent(target)}`
      router.replace(`/profile/setup${setupQuery}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.")
    } finally {
      setBusy(false)
    }
  }

  const loginHref = next
    ? `/login?next=${encodeURIComponent(safeReturnPath(next))}`
    : join
      ? `/login?join=${encodeURIComponent(join)}&next=${encodeURIComponent(`/?join=${encodeURIComponent(join)}`)}`
      : "/login"

  return (
    <AuthChrome title="Create your ledger profile">
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>Could not create account</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="font-heading text-3xl">Create account</CardTitle>
          <CardDescription>
            {joiningTrip
              ? "Create an account to join the trip. Next: your name, email, and phone (must match an invite if you got one)."
              : "Account required before joining a trip. Next step: display name, email, and phone."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signup-username">Username</Label>
            <Input
              id="signup-username"
              autoFocus
              value={username}
              autoComplete="username"
              placeholder="priya_k"
              onChange={(event) => setUsername(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Letters, numbers, . _ - — 2–40 characters.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password">Password</Label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSubmit) void onSubmit()
              }}
            />
            <p className="text-xs text-muted-foreground">At least 5 characters.</p>
          </div>
          <Button disabled={busy || !canSubmit} onClick={() => void onSubmit()} size="lg">
            Continue <ArrowRight />
          </Button>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href={loginHref} className="text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthChrome>
  )
}
