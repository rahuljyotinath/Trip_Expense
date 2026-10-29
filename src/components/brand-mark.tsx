import Link from "next/link"
import { AppLogo } from "@/components/app-logo"
import { brandHomeAriaLabel, getAppDisplayName, isDevelopmentBrand } from "@/lib/app-display-name"
import { cn } from "@/lib/utils"

const sizes = {
  sm: { icon: "size-7", text: "text-base", gap: "gap-1.5" },
  md: { icon: "size-9", text: "text-xl sm:text-2xl", gap: "gap-2" },
} as const

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
  const wordmark = getAppDisplayName()
  const dev = isDevelopmentBrand()
  const inner = (
    <>
      <AppLogo className={s.icon} />
      {showWordmark ? (
        <span
          className={cn(
            "font-heading tracking-tight",
            dev ? "text-sm sm:text-base" : s.text
          )}
        >
          {wordmark}
        </span>
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
      <Link href={href} className={rowClass} aria-label={brandHomeAriaLabel()}>
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
