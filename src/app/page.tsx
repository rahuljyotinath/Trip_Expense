import dynamic from "next/dynamic"
import { Suspense } from "react"
import { PageLoadFallback } from "@/components/page-load-fallback"
import { getOpeningAppMessage } from "@/lib/app-display-name"

const openingMessage = getOpeningAppMessage()

const WaybillApp = dynamic(
  () => import("@/components/waybill-app").then((m) => m.WaybillApp),
  { loading: () => <PageLoadFallback message={openingMessage} /> }
)

export const instant = false

export default function Page() {
  return (
    <Suspense fallback={<PageLoadFallback message={openingMessage} />}>
      <WaybillApp />
    </Suspense>
  )
}
