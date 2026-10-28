import dynamic from "next/dynamic"
import { Suspense } from "react"
import { PageLoadFallback } from "@/components/page-load-fallback"

const SignupPage = dynamic(
  () => import("@/components/profile/signup-page").then((m) => m.SignupPage),
  { loading: () => <PageLoadFallback message="Loading sign up…" /> }
)

export default function Page() {
  return (
    <Suspense fallback={<PageLoadFallback message="Loading sign up…" />}>
      <SignupPage />
    </Suspense>
  )
}
