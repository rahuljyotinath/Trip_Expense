import Link from "next/link"
import { MarketingShell } from "@/components/marketing/marketing-shell"

export const metadata = {
  title: "Terms — Tripzy",
  description: "Terms of use for Tripzy.",
}

export default function TermsPage() {
  return (
    <MarketingShell ctaHref="/" ctaLabel="Back to app">
      <h1 className="font-heading text-3xl">Terms of use</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: October 2026</p>
      <div className="prose prose-sm mt-8 max-w-none space-y-4 text-foreground dark:prose-invert">
        <p>
          Tripzy helps groups record shared expenses and settlements. By using the service you
          agree to use it lawfully and only for personal or authorized business trip accounting.
        </p>
        <h2 className="font-heading text-xl">No payment processing</h2>
        <p>
          Tripzy does not move money. UPI links open your bank or wallet app; we are not a
          payment service provider. You are responsible for verifying payee details before paying.
        </p>
        <h2 className="font-heading text-xl">Accuracy</h2>
        <p>
          Expense and settlement entries are provided by users. Operators and trip members are
          responsible for the accuracy of their ledgers.
        </p>
        <h2 className="font-heading text-xl">Availability</h2>
        <p>
          The service is provided as-is. We may change features, pricing for operator tiers, or
          availability with reasonable notice where practical.
        </p>
        <p>
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy policy
          </Link>
        </p>
      </div>
    </MarketingShell>
  )
}
