import { Suspense } from "react"
import { WaybillApp } from "@/components/waybill-app"

export const instant = false

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[50vh] w-full max-w-5xl flex-col items-center justify-center gap-3 px-4 py-10">
          <div className="ledger-loader" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <p className="text-sm text-muted-foreground">Opening the ledger…</p>
        </div>
      }
    >
      <WaybillApp />
    </Suspense>
  )
}
