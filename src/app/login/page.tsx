import { Suspense } from "react"
import { LoginPage } from "@/components/profile/login-page"

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <LoginPage />
    </Suspense>
  )
}
