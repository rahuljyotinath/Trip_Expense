import { Suspense } from "react"
import { TripAnalyticsPage } from "@/components/trip/trip-analytics-page"

export const instant = false

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Loading analytics…</p>
      }
    >
      <TripAnalyticsPage />
    </Suspense>
  )
}
