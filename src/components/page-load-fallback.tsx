"use client"

import { BrandMark } from "@/components/brand-mark"
import { cn } from "@/lib/utils"

export function LedgerLoader({ className }: { className?: string }) {
  return (
    <div className={cn("ledger-loader", className)} aria-hidden>
      <span />
      <span />
      <span />
    </div>
  )
}

type PageLoadFallbackProps = {
  message?: string
  /** Trip-style compact chrome (header + centered loader). */
  compact?: boolean
}

export function PageLoadFallback({
  message = "Loading…",
  compact = false,
}: PageLoadFallbackProps) {
  if (compact) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 sm:px-5">
        <header className="sticky top-0 z-30 -mx-4 mb-2 flex shrink-0 items-center border-b bg-background/95 px-4 pb-2 backdrop-blur-md sm:-mx-5 sm:px-5">
          <BrandMark size="sm" className="pointer-events-none opacity-90" />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
          <LedgerLoader />
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-5xl flex-col items-center justify-center gap-3 px-4 py-10 sm:min-h-[60vh]">
      <BrandMark size="md" className="pointer-events-none opacity-90" />
      <LedgerLoader />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
