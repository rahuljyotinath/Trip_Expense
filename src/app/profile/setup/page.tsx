import { Suspense } from "react"
import { ProfileSetupPage } from "@/components/profile/profile-setup-page"

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <ProfileSetupPage />
    </Suspense>
  )
}
