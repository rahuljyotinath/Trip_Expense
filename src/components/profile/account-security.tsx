"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

export function AccountSecurity({ recovery = false }: { recovery?: boolean }) {
  const [username, setUsername] = useState("")
  const [current, setCurrent] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      const response = await fetch(recovery ? "/api/auth/recover" : "/api/auth/password", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recovery ? { username, recoveryCode: current, newPassword: password } : { currentPassword: current, newPassword: password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Could not change password.")
      setCode(data.recoveryCode); setPassword(""); setCurrent("")
    } catch (error) { setError(error instanceof Error ? error.message : "Could not change password.") }
    finally { setBusy(false) }
  }
  return <Card className="mt-6 max-w-xl"><CardHeader><CardTitle>{recovery ? "Reset your password" : "Change password"}</CardTitle></CardHeader><CardContent>
    {code ? <div className="space-y-3" role="status"><p>Password changed. Other sessions have been signed out. Save your new recovery code; the old code no longer works.</p><code className="block break-all rounded border p-3 select-all">{code}</code>{recovery ? <a href="/login" className="underline">Sign in</a> : null}</div> : <form onSubmit={submit} className="space-y-3">
      {recovery ? <><Label htmlFor="recovery-username">Username</Label><Input id="recovery-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></> : null}
      <Label htmlFor="current-secret">{recovery ? "Recovery code" : "Current password"}</Label><Input id="current-secret" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete={recovery ? "off" : "current-password"} required />
      <Label htmlFor="new-password">New passphrase (at least 15 characters)</Label><Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={15} maxLength={1024} autoComplete="new-password" required />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<Button disabled={busy}>{busy ? "Saving…" : recovery ? "Reset password" : "Change password"}</Button>
    </form>}
  </CardContent></Card>
}
