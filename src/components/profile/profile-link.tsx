import Link from "next/link"
import type { ReactNode } from "react"
import { profilePublicHref } from "@/lib/profile-path"

export function ProfileLink({
  username,
  className,
  children,
}: {
  username: string
  className?: string
  children?: ReactNode
}) {
  if (!username.trim()) {
    return <>{children}</>
  }
  return (
    <Link
      href={profilePublicHref(username)}
      className={
        className ??
        "font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
      }
    >
      {children}
    </Link>
  )
}
