import dynamic from "next/dynamic"
import { Suspense } from "react"
import { PageLoadFallback } from "@/components/page-load-fallback"

const WaybillApp = dynamic(
  () => import("@/components/waybill-app").then((m) => m.WaybillApp),
  { loading: () => <PageLoadFallback message="Opening Tripzy…" /> }
)

export const instant = false

export default function Page() {
  return (
    <Suspense fallback={<PageLoadFallback message="Opening Tripzy…" />}>
      <WaybillApp />
    </Suspense>
  )
}
