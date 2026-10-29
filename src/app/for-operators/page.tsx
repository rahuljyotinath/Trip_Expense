import Link from "next/link"
import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Button } from "@/components/ui/button"
import { getAppDisplayName } from "@/lib/app-display-name"

const brand = getAppDisplayName()

export const metadata = {
  title: `${brand} for operators — treks, weddings, offsites`,
  description:
    "Roster workflow, branded invites, CSV export. Travelers never pay; operators subscribe.",
}

const packs = [
  {
    title: "Trek / homestay",
    price: "₹2,000–15,000 / month",
    detail: "By active trips or seat cap. Branded invite, roster import/export, multiple trips.",
  },
  {
    title: "Corporate offsite",
    price: "₹5,000–25,000 / event",
    detail: "HR roster import, finance read-only export, trip archive after the event.",
  },
  {
    title: "Wedding / planner",
    price: "₹1,000–5,000 / month / seat",
    detail: "Co-branded links per function or family side.",
  },
  {
    title: "College society",
    price: "Custom",
    detail: "Fest committees — often sponsor-funded.",
  },
]

export default function ForOperatorsPage() {
  return (
    <MarketingShell ctaHref="/" ctaLabel="Try self-serve export">
      <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        Operators
      </p>
      <h1 className="font-heading mt-2 text-4xl leading-tight">
        Your travelers never pay. You get the roster workflow.
      </h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        {brand} keeps the group on one ledger: nicknames, join codes, WhatsApp invites, settle
        and mark paid. Operators pay for scale — export, multi-trip ops, and brand on the invite
        link when you need it.
      </p>
      <ul className="mt-8 space-y-4">
        {packs.map((pack) => (
          <li
            key={pack.title}
            className="rounded-xl border px-4 py-4 shadow-sm ring-1 ring-foreground/5"
          >
            <p className="font-heading text-xl">{pack.title}</p>
            <p className="mt-1 text-sm font-medium text-primary">{pack.price}</p>
            <p className="mt-2 text-sm text-muted-foreground">{pack.detail}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">
        Self-serve today: trip CSV import/export, invite link + join code. Paid tiers add org
        dashboard, custom invite domain, and aggregate analytics. Strategy:{" "}
        <Link href="/vs-splitwise" className="underline underline-offset-4">
          why groups pick {brand}
        </Link>
        .
      </p>
      <p className="mt-4 text-sm">
        Design partners: see{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">docs/gtm/design-partner-metrics.md</code>{" "}
        in the repo. Sales contact: fill before outbound (one-pager).
      </p>
      <Button
        nativeButton={false}
        className="mt-8"
        render={<Link href="/" />}
        size="lg"
      >
        Open a pilot trip
      </Button>
    </MarketingShell>
  )
}
