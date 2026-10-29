import Link from "next/link"
import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Button } from "@/components/ui/button"
import { getAppDisplayName } from "@/lib/app-display-name"

const brand = getAppDisplayName()

export const metadata = {
  title: `${brand} vs Splitwise — India group splits`,
  description:
    "Unlimited trip-day spends, no ads, WhatsApp invites. Splitwise alternative for trips and groups in India.",
}

const rows = [
  { label: "Free tier daily expense cap", tripzy: "None", splitwise: "4 per day (free)" },
  { label: "Ads on free tier", tripzy: "No", splitwise: "Yes" },
  { label: "Trip roster + join code", tripzy: "Built in", splitwise: "Generic groups" },
  { label: "WhatsApp invite copy", tripzy: "One tap", splitwise: "Link only" },
  { label: "INR-first defaults", tripzy: "Yes", splitwise: "Global (100+ currencies)" },
  { label: "Operator / trek workflows", tripzy: "CSV roster, export", splitwise: "Consumer-focused" },
  { label: "Price to split with friends", tripzy: "Free", splitwise: "Free (with limits)" },
]

export default function VsSplitwisePage() {
  return (
    <MarketingShell>
      <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        Compare
      </p>
      <h1 className="font-heading mt-2 text-4xl leading-tight">
        Split trips and groups without Splitwise limits.
      </h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        {brand} is built for India group trips and ad-hoc splits — Goa weekends, wedding sides,
        office lunches, flatmate weeks. No daily cap on spends, no ad clutter, roster nicknames
        and settle that match how your group actually travels.
      </p>
      <div className="mt-8 overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 font-medium">Feature</th>
              <th className="px-4 py-3 font-medium text-primary">{brand}</th>
              <th className="px-4 py-3 font-medium">Splitwise</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b last:border-0">
                <td className="px-4 py-3 text-muted-foreground">{row.label}</td>
                <td className="px-4 py-3 font-medium">{row.tripzy}</td>
                <td className="px-4 py-3">{row.splitwise}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Splitwise is strong for long-lived roommate groups and global FX. {brand} wins on{" "}
        <strong className="font-medium text-foreground">trip day volume</strong>, India-native
        invite flow, and operator-led trips where everyone should stay on one ledger.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button nativeButton={false} render={<Link href="/" />} size="lg">
          Start a trip — free
        </Button>
        <Button
          nativeButton={false}
          render={<Link href="/for-operators" />}
          size="lg"
          variant="outline"
        >
          Running treks or events?
        </Button>
      </div>
    </MarketingShell>
  )
}
