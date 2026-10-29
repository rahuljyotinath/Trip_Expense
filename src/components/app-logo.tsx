import { isDevelopmentBrand } from "@/lib/app-display-name"
import { cn } from "@/lib/utils"

/** Shared mark for header, loaders, and favicon artwork. */
export function AppLogo({ className }: { className?: string }) {
  const dev = isDevelopmentBrand()
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect
        width="32"
        height="32"
        rx="8"
        className={dev ? "fill-slate-600" : "fill-primary"}
      />
      {dev ? (
        <path
          d="M4 4 L28 28 M28 4 L4 28"
          stroke="currentColor"
          strokeWidth="1.25"
          className="text-amber-400/70"
          strokeLinecap="round"
        />
      ) : null}
      <path
        d="M10 11h12M16 11v11"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="text-primary-foreground"
      />
      <path
        d="M16 18c3 0 5.5 1.2 7 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-primary-foreground"
      />
      <circle
        cx="23"
        cy="22.5"
        r="2.25"
        className={dev ? "fill-amber-400" : "fill-moss"}
      />
      {dev ? (
        <text
          x="16"
          y="30"
          textAnchor="middle"
          className="fill-primary-foreground font-mono text-[5px] font-bold tracking-wider"
        >
          DEV
        </text>
      ) : null}
    </svg>
  )
}
