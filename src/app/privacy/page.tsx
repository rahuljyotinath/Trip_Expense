import Link from "next/link"
import { BrandMark } from "@/components/brand-mark"
import { brandPageTitle, getAppDisplayName } from "@/lib/app-display-name"

const brand = getAppDisplayName()

export const metadata = {
  title: brandPageTitle("Privacy"),
  description: `How ${brand} handles your account and trip data.`,
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 pb-16">
      <header className="mb-8">
        <Link href="/">
          <BrandMark size="sm" />
        </Link>
      </header>
      <h1 className="font-heading text-3xl">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: October 2026</p>
      <div className="prose prose-sm mt-8 max-w-none space-y-4 text-foreground dark:prose-invert">
        <p>
          {brand} (&quot;we&quot;) helps groups track shared trip expenses. This policy describes what
          we collect and how we use it when you use our website or mobile apps.
        </p>
        <h2 className="font-heading text-xl">Information we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Account:</strong> username, password (stored hashed), display name, optional
            email and phone for profile and trip invites.
          </li>
          <li>
            <strong>Trip data:</strong> trip names, join codes, roster nicknames, expenses,
            payments, and settlement-related metadata you enter.
          </li>
          <li>
            <strong>Technical:</strong> session cookies or tokens for sign-in; standard server logs
            from our host (Vercel).
          </li>
        </ul>
        <h2 className="font-heading text-xl">How we use it</h2>
        <p>
          To operate the service: authenticate you, store your trips in our database (Supabase
          Postgres), show trips only to members (or invite holders with a valid join code), and
          sync offline edits from your device when you reconnect.
        </p>
        <h2 className="font-heading text-xl">Sharing</h2>
        <p>
          We do not sell your data. Trip details are visible to people on that trip&apos;s roster
          (and admins where applicable). We use infrastructure providers (hosting and database) to
          run the app.
        </p>
        <h2 className="font-heading text-xl">Your choices</h2>
        <p>
          You can sign out at any time. Contact the trip admin to leave a trip roster. For account
          deletion or export requests, contact the operator of your {brand} deployment.
        </p>
        <h2 className="font-heading text-xl">Security</h2>
        <p>
          Passwords are hashed. Sessions use signed tokens. Use HTTPS in production.
        </p>
        <p>
          <Link href="/" className="underline underline-offset-4">
            Back to {brand}
          </Link>
        </p>
      </div>
    </div>
  )
}
