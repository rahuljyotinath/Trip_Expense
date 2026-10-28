import { Suspense } from "react"
import { TripSettingsPage } from "@/components/trip/trip-settings-page"

export const instant = false

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Loading trip settings…</p>
      }
    >
      <TripSettingsPage />
    </Suspense>
  )
}
