import Link from "next/link"
import type { ReactNode } from "react"

export function AuthChrome({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 hero-glow" aria-hidden />
      <header className="relative mb-8">
        <Link href="/" className="rounded-lg transition-opacity hover:opacity-90">
          <p className="font-mono text-[11px] tracking-[0.22em] text-stamp uppercase">
            Group ledger
          </p>
          <h1 className="font-heading text-4xl tracking-tight sm:text-5xl sm:text-[2.75rem]">
            Trip Expenses Balancer
          </h1>
        </Link>
        <p className="mt-2 text-sm text-muted-foreground">{title}</p>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
