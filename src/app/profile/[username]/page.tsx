import dynamic from "next/dynamic"
import { PageLoadFallback } from "@/components/page-load-fallback"

const PublicProfilePage = dynamic(
  () =>
    import("@/components/profile/public-profile-page").then(
      (m) => m.PublicProfilePage
    ),
  { loading: () => <PageLoadFallback message="Loading profile…" /> }
)

export const instant = false

export default function Page() {
  return <PublicProfilePage />
}
