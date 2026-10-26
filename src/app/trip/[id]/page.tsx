import { Suspense } from "react"
import { TripPage } from "@/components/trip/trip-page"

export const instant = false

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Loading trip…</p>
      }
    >
      <TripPage />
    </Suspense>
  )
}
