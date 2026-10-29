"use client"

import Link from "next/link"
import { BrandMark } from "@/components/brand-mark"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { Health } from "@/lib/client-api"
import type { PublicProfile } from "@/lib/types"
import { AlertCircle, ChevronLeft } from "lucide-react"

export function Shell({
  children,
  health,
  profile,
  onHome,
  onLogout,
  compact = false,
}: {
  children: React.ReactNode
  health: Health | null
  profile: PublicProfile | null
  onHome?: () => void
  onLogout?: () => void
  compact?: boolean
}) {
  const brand = process.env.NEXT_PUBLIC_APP_DISPLAY_NAME?.trim() || "Tripzy"
  const development = brand !== "Tripzy"

  return (
    <div
      className={
        compact
          ? "relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 sm:px-5 lg:py-5"
          : "relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10"
      }
    >
      {!compact ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 hero-glow" aria-hidden />
      ) : null}
      <header
        className={
          compact
            ? "sticky top-0 z-30 -mx-4 mb-2 flex shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 pb-2 backdrop-blur-md sm:-mx-5 sm:px-5 lg:relative lg:mx-0 lg:mb-3 lg:bg-transparent lg:px-0 lg:backdrop-blur-none"
            : "relative mb-8 flex items-start justify-between gap-4"
        }
      >
        <div className="flex min-h-10 min-w-0 flex-1 items-center gap-0.5">
          {compact && onHome ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 lg:hidden"
              onClick={onHome}
              aria-label="Back"
            >
              <ChevronLeft />
            </Button>
          ) : null}
          {compact ? (
            <BrandMark
              size="sm"
              onClick={onHome}
              className={onHome ? undefined : "pointer-events-none opacity-100"}
            />
          ) : (
            <div className="min-w-0">
              <BrandMark size="md" onClick={onHome} />
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Free trip khata for India — WhatsApp pe link bhejo, bill split karo, settle clear.
                Friends ke liye hamesha free.
              </p>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right text-sm">
          {profile ? (
            <>
              <p className="max-w-[7rem] truncate font-medium sm:max-w-none">{profile.name}</p>
              <p className="hidden text-xs text-muted-foreground sm:block">@{profile.username}</p>
              <div className="hidden gap-2 sm:flex sm:items-center sm:justify-end">
                <Link
                  href="/profile/setup"
                  className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Profile
                </Link>
                {onLogout ? (
                  <Button variant="link" className="h-auto px-0 text-xs" onClick={onLogout}>
                    Sign out
                  </Button>
                ) : null}
              </div>
              <Link
                href="/profile/setup"
                className="text-[11px] text-muted-foreground underline underline-offset-4 sm:hidden"
              >
                Profile
              </Link>
            </>
          ) : (
            <p className="text-muted-foreground">Not signed in</p>
          )}
        </div>
      </header>
      {development ? (
        <Alert className={compact ? "mb-2 border-amber-500/40 bg-amber-500/10 py-2" : "mb-4 border-amber-500/40 bg-amber-500/10"}>
          <AlertCircle className="text-amber-700 dark:text-amber-400" />
          <AlertTitle>{brand}</AlertTitle>
          <AlertDescription>
            Development preview — separate database, not production Tripzy.
          </AlertDescription>
        </Alert>
      ) : null}
      {health?.warning ? (
        <Alert className={compact ? "mb-2 py-2" : "mb-4"}>
          <AlertCircle />
          <AlertTitle>Storage</AlertTitle>
          <AlertDescription>{health.warning}</AlertDescription>
        </Alert>
      ) : null}
      {health?.notice ? (
        <Alert className={compact ? "mb-2 py-2" : "mb-4"} variant="destructive">
          <AlertCircle />
          <AlertTitle>Connection</AlertTitle>
          <AlertDescription>{health.notice}</AlertDescription>
        </Alert>
      ) : null}
      <main className={compact ? "flex flex-1 flex-col" : "flex-1"}>{children}</main>
    </div>
  )
}
