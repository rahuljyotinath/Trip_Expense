import dynamic from "next/dynamic"
import { Suspense } from "react"
import { PageLoadFallback } from "@/components/page-load-fallback"

const LoginPage = dynamic(
  () => import("@/components/profile/login-page").then((m) => m.LoginPage),
  { loading: () => <PageLoadFallback message="Loading sign in…" /> }
)

export default function Page() {
  return (
    <Suspense fallback={<PageLoadFallback message="Loading sign in…" />}>
      <LoginPage />
    </Suspense>
  )
}
