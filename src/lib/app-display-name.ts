/** Browser tab, PWA, header, and copy (Preview builds use Tripzy_Development). */
export function getAppDisplayName(): string {
  return process.env.NEXT_PUBLIC_APP_DISPLAY_NAME?.trim() || "Tripzy"
}

export function isDevelopmentBrand(): boolean {
  return getAppDisplayName() !== "Tripzy"
}

export function getOpeningAppMessage(): string {
  return `Opening ${getAppDisplayName()}…`
}

export function brandPageTitle(page: string): string {
  return `${page} — ${getAppDisplayName()}`
}

export function brandHomeAriaLabel(): string {
  return `${getAppDisplayName()} home`
}
