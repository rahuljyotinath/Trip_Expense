import dynamic from "next/dynamic"
import { PageLoadFallback } from "@/components/page-load-fallback"

const TripAnalyticsPage = dynamic(
  () =>
    import("@/components/trip/trip-analytics-page").then(
      (m) => m.TripAnalyticsPage
    ),
  { loading: () => <PageLoadFallback message="Loading analytics…" compact /> }
)

export const instant = false

export default function Page() {
  return <TripAnalyticsPage />
}
