import { PageLoadFallback } from "@/components/page-load-fallback"
import { getOpeningAppMessage } from "@/lib/app-display-name"

export default function Loading() {
  return <PageLoadFallback message={getOpeningAppMessage()} />
}
