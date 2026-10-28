import dynamic from "next/dynamic"
import { Suspense } from "react"
import { PageLoadFallback } from "@/components/page-load-fallback"

const ProfileSetupPage = dynamic(
  () =>
    import("@/components/profile/profile-setup-page").then(
      (m) => m.ProfileSetupPage
    ),
  { loading: () => <PageLoadFallback message="Loading profile setup…" /> }
)

export default function Page() {
  return (
    <Suspense fallback={<PageLoadFallback message="Loading profile setup…" />}>
      <ProfileSetupPage />
    </Suspense>
  )
}
