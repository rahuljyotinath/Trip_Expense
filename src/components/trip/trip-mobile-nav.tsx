"use client"

import Link from "next/link"
import {
  Banknote,
  BarChart3,
  Receipt,
  Scale,
  Settings,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TripTabId } from "@/components/trip/trip-page-chrome"

function navItemClass(active: boolean) {
  return cn(
    "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors touch-manipulation",
    active ? "text-primary" : "text-muted-foreground"
  )
}

export function TripMobileBottomNav({
  tripPath,
  active,
  tabHref,
  showSettings = false,
}: {
  tripPath: string
  active: TripTabId
  tabHref: (tab: "settle" | "ledger" | "people") => string
  showSettings?: boolean
}) {
  const tabs: Array<{
    id: TripTabId
    label: string
    href: string
    icon: typeof Receipt
  }> = [
    { id: "ledger", label: "Ledger", href: tabHref("ledger"), icon: Receipt },
    { id: "settle", label: "Settle", href: tabHref("settle"), icon: Scale },
    { id: "people", label: "People", href: tabHref("people"), icon: Users },
    {
      id: "analytics",
      label: "Stats",
      href: `${tripPath}/analytics`,
      icon: BarChart3,
    },
  ]
  if (showSettings) {
    tabs.push({
      id: "settings",
      label: "Settings",
      href: `${tripPath}/settings`,
      icon: Settings,
    })
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md lg:hidden"
      aria-label="Trip sections"
    >
      <div className="mx-auto flex max-w-6xl items-stretch justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = active === tab.id
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={navItemClass(isActive)}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={cn("size-5 shrink-0", isActive && "stroke-[2.25]")}
                aria-hidden
              />
              <span className="truncate">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function TripMobileActionBar({
  canWrite,
  busy,
  onPaymentOpen,
  onAddExpense,
}: {
  canWrite: boolean
  busy: boolean
  onPaymentOpen: () => void
  onAddExpense: () => void
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] z-40 border-t bg-background/95 px-4 py-2 backdrop-blur-md lg:hidden"
      role="toolbar"
      aria-label="Trip actions"
    >
      <div className="mx-auto flex max-w-6xl gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 touch-manipulation"
          disabled={!canWrite || busy}
          onClick={onPaymentOpen}
        >
          <Banknote className="size-4" />
          Paid back
        </Button>
        <Button
          type="button"
          className="h-11 flex-[1.2] touch-manipulation shadow-sm"
          disabled={!canWrite || busy}
          onClick={onAddExpense}
        >
          <Receipt className="size-4" />
          Add spend
        </Button>
      </div>
    </div>
  )
}
