"use client"

import { useMemo, useState } from "react"
import { Check, Link2, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { tripJoinPath, tripJoinUrl } from "@/lib/trip-invite-url"
import { whatsappInviteMessage, whatsappShareUrl } from "@/lib/whatsapp-invite"
import type { Group } from "@/lib/types"

export function TripJoinLinkActions({
  group,
  compact = false,
}: {
  group: Group
  compact?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const path = tripJoinPath(group.id, group.code)
  const absoluteUrl = useMemo(() => {
    if (typeof window === "undefined") return path
    return tripJoinUrl(group.id, group.code, window.location.origin)
  }, [group.id, group.code, path])

  async function copyLink() {
    await navigator.clipboard.writeText(absoluteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function shareWhatsApp() {
    const message = whatsappInviteMessage(group.name, absoluteUrl)
    window.open(whatsappShareUrl(message), "_blank", "noopener,noreferrer")
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
          {copied ? <Check /> : <Link2 />}
          {copied ? "Copied" : "Invite link"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={shareWhatsApp}>
          <MessageCircle />
          WhatsApp
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm font-medium">Invite link</p>
      <p className="text-xs text-muted-foreground">
        Share this link — friends can sign up, open the trip, and claim their nickname.
      </p>
      <p className="break-all font-mono text-xs text-muted-foreground">{absoluteUrl}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
          {copied ? <Check /> : <Link2 />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={shareWhatsApp}>
          <MessageCircle />
          Share on WhatsApp
        </Button>
      </div>
    </div>
  )
}
