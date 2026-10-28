import dynamic from "next/dynamic"
import { PageLoadFallback } from "@/components/page-load-fallback"

const TripSettingsPage = dynamic(
  () =>
    import("@/components/trip/trip-settings-page").then(
      (m) => m.TripSettingsPage
    ),
  { loading: () => <PageLoadFallback message="Loading settings…" compact /> }
)

export const instant = false

export default function Page() {
  return <TripSettingsPage />
}
