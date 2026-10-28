import dynamic from "next/dynamic"
import { PageLoadFallback } from "@/components/page-load-fallback"

const TripPage = dynamic(
  () => import("@/components/trip/trip-page").then((m) => m.TripPage),
  { loading: () => <PageLoadFallback message="Loading trip…" compact /> }
)

export const instant = false

export default function Page() {
  return <TripPage />
}
