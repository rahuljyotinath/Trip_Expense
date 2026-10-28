import type { ReactNode } from "react"
import { BrandMark } from "@/components/brand-mark"

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
        <BrandMark size="md" href="/" />
        <p className="mt-3 text-sm text-muted-foreground">{title}</p>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
