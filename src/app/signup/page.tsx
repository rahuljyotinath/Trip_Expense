import { Suspense } from "react"
import { SignupPage } from "@/components/profile/signup-page"

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <SignupPage />
    </Suspense>
  )
}
