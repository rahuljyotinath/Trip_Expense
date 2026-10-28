import Link from "next/link"
import { BrandMark } from "@/components/brand-mark"

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandMark size="md" />
      <h1 className="font-heading text-2xl">You&apos;re offline</h1>
      <p className="text-sm text-muted-foreground">
        Tripzy needs a connection to open trips. Edits you already made on this device will sync
        when you&apos;re back online.
      </p>
      <Link href="/" className="text-sm font-medium underline underline-offset-4">
        Try again
      </Link>
    </div>
  )
}
