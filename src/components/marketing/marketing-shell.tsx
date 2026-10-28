import Link from "next/link"
import type { ReactNode } from "react"
import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"

export function MarketingShell({
  children,
  ctaHref = "/",
  ctaLabel = "Open Tripzy",
}: {
  children: ReactNode
  ctaHref?: string
  ctaLabel?: string
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-16">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link href="/">
          <BrandMark size="sm" />
        </Link>
        <Button nativeButton={false} render={<Link href={ctaHref} />} size="sm">
          {ctaLabel}
        </Button>
      </header>
      {children}
      <footer className="mt-12 flex flex-wrap gap-x-4 gap-y-2 border-t pt-6 text-sm text-muted-foreground">
        <Link href="/vs-splitwise" className="underline underline-offset-4">
          vs Splitwise
        </Link>
        <Link href="/for-operators" className="underline underline-offset-4">
          For operators
        </Link>
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy
        </Link>
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>
      </footer>
    </div>
  )
}
