import { Suspense } from "react"
import { WaybillApp } from "@/components/waybill-app"

export const instant = false

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-5xl px-4 py-10 text-muted-foreground">
          Opening the ledger…
        </div>
      }
    >
      <WaybillApp />
    </Suspense>
  )
}
