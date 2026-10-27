import { Suspense } from "react"
import { PublicProfilePage } from "@/components/profile/public-profile-page"

export const instant = false

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Loading profile…</p>
      }
    >
      <PublicProfilePage />
    </Suspense>
  )
}
