import Link from "next/link"
import { cn } from "@/lib/utils"

const sizes = {
  sm: { icon: "size-7", text: "text-base", gap: "gap-1.5" },
  md: { icon: "size-9", text: "text-xl sm:text-2xl", gap: "gap-2" },
} as const

function TripzyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 text-primary-foreground", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M10 11h12M16 11v11"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M16 18c3 0 5.5 1.2 7 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="23" cy="22.5" r="2.25" className="fill-moss" />
    </svg>
  )
}

export function BrandMark({
  size = "md",
  showWordmark = true,
  href,
  onClick,
  className,
}: {
  size?: keyof typeof sizes
  showWordmark?: boolean
  href?: string
  onClick?: () => void
  className?: string
}) {
  const s = sizes[size]
  const inner = (
    <>
      <TripzyIcon className={s.icon} />
      {showWordmark ? (
        <span className={cn("font-heading tracking-tight", s.text)}>Tripzy</span>
      ) : null}
    </>
  )
  const rowClass = cn(
    "inline-flex min-w-0 items-center",
    s.gap,
    (href || onClick) && "transition-opacity hover:opacity-90",
    className
  )

  if (href) {
    return (
      <Link href={href} className={rowClass} aria-label="Tripzy home">
        {inner}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(rowClass, "text-left")}>
        {inner}
      </button>
    )
  }
  return <span className={rowClass}>{inner}</span>
}
