"use client"

import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Group } from "@/lib/types"

function dismissKey(groupId: string) {
  return `waybill-travel-dismiss:${groupId}`
}

function travelSearchLinks(tripName: string) {
  const q = encodeURIComponent(tripName.trim() || "India trip")
  const mmtBase = process.env.NEXT_PUBLIC_AFFILIATE_MMT?.trim()
  const redBusBase = process.env.NEXT_PUBLIC_AFFILIATE_REDBUS?.trim()
  return [
    {
      label: "Hotels & flights",
      href:
        mmtBase ||
        `https://www.makemytrip.com/hotels/hotel-listing/?city=${q}`,
    },
    {
      label: "Bus tickets",
      href: redBusBase || `https://www.redbus.in/bus-tickets`,
    },
    {
      label: "Travel insurance",
      href: "https://www.acko.com/travel-insurance/",
    },
  ]
}

function readDismissed(groupId: string) {
  if (typeof sessionStorage === "undefined") return false
  try {
    return sessionStorage.getItem(dismissKey(groupId)) === "1"
  } catch {
    return false
  }
}

export function TripTravelAffiliate({ group }: { group: Group }) {
  const hasDates = Boolean(group.startDate || group.endDate)
  const [dismissed, setDismissed] = useState(() => readDismissed(group.id))

  if (!hasDates || dismissed) return null

  const links = travelSearchLinks(group.name)

  return (
    <Card className="border-dashed bg-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Plan travel (optional)</CardTitle>
        <CardDescription>
          Booking links for your trip dates — Waybill earns nothing unless affiliate IDs are set.
          Ledger stays free.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium shadow-sm hover:bg-muted"
          >
            {link.label}
            <ExternalLink className="size-3.5" />
          </a>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            try {
              sessionStorage.setItem(dismissKey(group.id), "1")
            } catch {
              /* ignore */
            }
            setDismissed(true)
          }}
        >
          Hide for this trip
        </Button>
      </CardContent>
    </Card>
  )
}
