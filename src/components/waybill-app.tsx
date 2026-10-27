"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle,
  Banknote,
  Check,
  Compass,
  Download,
  Link2,
  Sparkles,
  Upload,
  Users,
  Pencil,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  claimSeat,
  commitGroupPatch,
  fetchGroup,
  fetchGroupByCode,
  fetchMyGroups,
  loadHealth,
  logoutUser,
  fetchSessionProfile,
  openTrip,
  clearSavedProfile,
  syncProfileToLocalStore,
  type Health,
} from "@/lib/client-api"
import {
  expensesByDay,
  ledgerGroupExpenses,
  ledgerPersonalExpenses,
  ledgerPersonalPayments,
  personalExpenditureForMember,
} from "@/lib/ledger-display"
import { todayIsoDate } from "@/lib/ids"
import { formatMoney, parseAmount } from "@/lib/money"
import { suggestedMember } from "@/lib/operations"
import { settlementBalances, simplifyDebts } from "@/lib/settle"
import { parseJoinInput } from "@/lib/join"
import { tripStats } from "@/lib/stats"
import { downloadTripCsvFile, parseTripCsv } from "@/lib/trip-csv"
import { profileNeedsSetup } from "@/lib/auth-ops"
import type { Expense, Group, PublicProfile } from "@/lib/types"

type Screen = "boot" | "home" | "create" | "join"

function memberName(group: Group, id: string) {
  return group.members.find((member) => member.id === id)?.name ?? "Unknown"
}

function mySeat(group: Group, profileId: string) {
  return group.members.find((member) => member.profileId === profileId) ?? null
}

function formatDay(date: string) {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatDayDots(isoDate: string) {
  const [y, m, d] = isoDate.split("-")
  if (!y || !m || !d) return isoDate
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`
}

function formatTripDates(group: Group) {
  const { startDate, endDate } = group
  if (!startDate && !endDate) return null
  if (startDate && endDate) {
    const start = new Date(`${startDate}T00:00:00`)
    const end = new Date(`${endDate}T00:00:00`)
    const sameYear =
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      start.getFullYear() === end.getFullYear()
    const startLabel = start.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    })
    return `${startLabel} – ${formatDay(endDate)}`
  }
  if (startDate) return `From ${formatDay(startDate)}`
  return `Until ${formatDay(endDate!)}`
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "That failed."
}

function applyGroupPatchOptimistic(input: {
  group: Group
  profile: PublicProfile
  body: Record<string, unknown>
  onGroup: (next: Group) => void
  onError: (message: string | null) => void
  onBusy: (busy: boolean) => void
  onDone?: () => void
  refresh?: () => Promise<void>
}) {
  const { group, profile, body, onGroup, onError, onBusy, onDone } = input
  onBusy(true)
  onError(null)
  commitGroupPatch(group, body, {
    onApplied: (next) => {
      onGroup(next)
      onBusy(false)
      onDone?.()
    },
    onError: (message) => {
      onError(message)
      onBusy(false)
    },
    onReconciled: (next) => {
      onGroup(next)
    },
    fetchLatest: () => fetchGroup(group.id),
  }, profile)
}

export function WaybillApp() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const joinFromUrl = (searchParams.get("join") ?? "").toUpperCase()
  const tripFromUrl = (searchParams.get("trip") ?? "").trim()

  const [screen, setScreen] = useState<Screen>("boot")
  const [health, setHealth] = useState<Health | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [tripName, setTripName] = useState("")
  const [currency, setCurrency] = useState("INR")
  const [tripStartDate, setTripStartDate] = useState("")
  const [tripEndDate, setTripEndDate] = useState("")
  const [people, setPeople] = useState<string[]>([])
  const [personDraft, setPersonDraft] = useState("")
  const [code, setCode] = useState(joinFromUrl)
  const [joinGroup, setJoinGroup] = useState<Group | null>(null)

  async function refreshGroups(nextProfile: PublicProfile) {
    const list = await fetchMyGroups(nextProfile.id)
    setGroups(list)
    return list
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [nextHealth, session] = await Promise.all([
          loadHealth(),
          fetchSessionProfile(),
        ])
        if (cancelled) return
        setHealth(nextHealth)
        if (tripFromUrl) {
          router.replace(`/trip/${encodeURIComponent(tripFromUrl)}`)
          return
        }
        if (joinFromUrl) {
          try {
            const invited = await fetchGroupByCode(joinFromUrl)
            router.replace(`/trip/${invited.id}`)
          } catch {
            if (!session?.id) {
              router.replace(`/login?next=${encodeURIComponent("/")}`)
              return
            }
            setCode(joinFromUrl)
            setScreen("join")
          }
          return
        }
        if (!session?.id || !session?.username) {
          clearSavedProfile()
          router.replace("/login")
          return
        }
        if (cancelled) return
        if (profileNeedsSetup(session)) {
          router.replace("/profile/setup")
          return
        }
        setProfile(session)
        syncProfileToLocalStore(session)
        await refreshGroups(session)
        setScreen("home")
      } catch (err) {
        if (!cancelled) {
          setError(errorText(err))
          router.replace("/login")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [joinFromUrl, tripFromUrl, router])

  async function onLogout() {
    setBusy(true)
    setError(null)
    try {
      await logoutUser()
      setProfile(null)
      setGroups([])
      router.replace("/login")
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function addPerson() {
    const value = personDraft.replace(/\s+/g, " ").trim()
    if (!value) return
    if (people.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setPersonDraft("")
      return
    }
    setPeople((current) => [...current, value])
    setPersonDraft("")
  }

  function rosterNames() {
    const extra = personDraft.replace(/\s+/g, " ").trim()
    if (!extra) return people
    if (people.some((item) => item.toLowerCase() === extra.toLowerCase())) {
      return people
    }
    return [...people, extra]
  }

  async function onCreateTrip() {
    if (!profile) return
    const memberNames = rosterNames()
    if (memberNames.length < 2) {
      setError("Add at least one other nickname, then write the roster.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await openTrip({
        name: tripName,
        memberNames,
        createdByProfileId: profile.id,
        currency,
        startDate: tripStartDate.trim() || null,
        endDate: tripEndDate.trim() || null,
      })
      setPersonDraft("")
      await refreshGroups(profile)
      router.push(`/trip/${next.id}`)
      setTripName("")
      setTripStartDate("")
      setTripEndDate("")
      setPeople([])
      setPersonDraft("")
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function onLookupCode() {
    setBusy(true)
    setError(null)
    try {
      const next = await fetchGroupByCode(parseJoinInput(code))
      setJoinGroup(next)
    } catch (err) {
      setJoinGroup(null)
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function onClaim(memberId: string) {
    if (!profile || !joinGroup) return
    setBusy(true)
    setError(null)
    try {
      const next = await claimSeat(joinGroup.id, memberId, profile.id)
      setJoinGroup(null)
      await refreshGroups(profile)
      router.push(`/trip/${next.id}`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function openExisting(id: string) {
    router.push(`/trip/${id}`)
  }

  if (screen === "boot") {
    return (
      <Shell health={health} profile={profile}>
        <BootLoader />
      </Shell>
    )
  }

  return (
    <Shell
      health={health}
      profile={profile}
      onLogout={profile ? onLogout : undefined}
      onHome={undefined}
    >
      {error ? (
        <Alert variant="destructive" className="mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle />
          <AlertTitle>Hold on</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div key={screen} className="screen-enter">
      {screen === "home" && profile ? (
        <Home
          profile={profile}
          groups={groups}
          busy={busy}
          onCreate={() => {
            setError(null)
            setPeople(profile.name ? [profile.name] : [])
            setScreen("create")
          }}
          onJoin={() => {
            setError(null)
            setJoinGroup(null)
            setScreen("join")
          }}
          onOpen={openExisting}
        />
      ) : null}

      {screen === "create" && profile ? (
        <CreateTrip
          profile={profile}
          tripName={tripName}
          currency={currency}
          startDate={tripStartDate}
          endDate={tripEndDate}
          people={people}
          personDraft={personDraft}
          busy={busy}
          onTripName={setTripName}
          onCurrency={setCurrency}
          onStartDate={setTripStartDate}
          onEndDate={setTripEndDate}
          onDraft={setPersonDraft}
          onAddPerson={addPerson}
          onRemovePerson={(value) =>
            setPeople((current) => current.filter((item) => item !== value))
          }
          onBack={() => setScreen("home")}
          onSubmit={onCreateTrip}
        />
      ) : null}

      {screen === "join" && profile ? (
        <JoinTrip
          profile={profile}
          code={code}
          group={joinGroup}
          busy={busy}
          onCode={setCode}
          onLookup={onLookupCode}
          onClaim={onClaim}
          onBack={() => setScreen("home")}
        />
      ) : null}

      </div>
    </Shell>
  )
}

function BootLoader() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="relative flex size-16 items-center justify-center rounded-2xl bg-card shadow-md ring-1 ring-foreground/10">
        <Sparkles className="size-7 text-primary motion-safe:animate-pulse" />
      </div>
      <div>
        <p className="font-heading text-xl">Opening the ledger</p>
        <p className="mt-1 text-sm text-muted-foreground">Syncing your trips…</p>
      </div>
      <div className="ledger-loader" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

export function Shell({
  children,
  health,
  profile,
  onHome,
  onLogout,
  compact = false,
}: {
  children: React.ReactNode
  health: Health | null
  profile: PublicProfile | null
  onHome?: () => void
  onLogout?: () => void
  compact?: boolean
}) {
  return (
    <div
      className={
        compact
          ? "relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-4 sm:px-5 lg:py-5"
          : "relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10"
      }
    >
      {!compact ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 hero-glow" aria-hidden />
      ) : null}
      <header
        className={
          compact
            ? "relative mb-3 flex items-center justify-between gap-3 border-b pb-3"
            : "relative mb-8 flex items-start justify-between gap-4"
        }
      >
        <button
          type="button"
          onClick={onHome}
          className="rounded-lg text-left transition-opacity hover:opacity-90 disabled:cursor-default"
          disabled={!onHome}
        >
          {compact ? (
            <span className="font-heading text-lg tracking-tight sm:text-xl">
              Trip Expenses Balancer
            </span>
          ) : (
            <>
              <p className="font-mono text-[11px] tracking-[0.22em] text-stamp uppercase">
                Group ledger
              </p>
              <h1 className="font-heading text-4xl tracking-tight sm:text-5xl sm:text-[2.75rem]">
                Trip Expenses Balancer
              </h1>
            </>
          )}
        </button>
        <div className="text-right text-sm">
          {profile ? (
            <>
              <p className="font-medium">{profile.name}</p>
              <p className="text-xs text-muted-foreground">@{profile.username}</p>
              <Link
                href="/profile/setup"
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Profile
              </Link>
              {onLogout ? (
                <Button variant="link" className="h-auto px-0 text-xs" onClick={onLogout}>
                  Sign out
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">Not signed in</p>
          )}
        </div>
      </header>
      {health?.warning ? (
        <Alert className={compact ? "mb-2 py-2" : "mb-4"}>
          <AlertCircle />
          <AlertTitle>Storage</AlertTitle>
          <AlertDescription>{health.warning}</AlertDescription>
        </Alert>
      ) : null}
      {health?.notice ? (
        <Alert className={compact ? "mb-2 py-2" : "mb-4"} variant="destructive">
          <AlertCircle />
          <AlertTitle>Connection</AlertTitle>
          <AlertDescription>{health.notice}</AlertDescription>
        </Alert>
      ) : null}
      <main className="flex-1">{children}</main>
    </div>
  )
}

function Home({
  profile,
  groups,
  busy,
  onCreate,
  onJoin,
  onOpen,
}: {
  profile: PublicProfile
  groups: Group[]
  busy: boolean
  onCreate: () => void
  onJoin: () => void
  onOpen: (id: string) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-3xl">Hey {profile.name}.</h2>
        <p className="mt-1 max-w-xl text-muted-foreground">
          Opening a trip writes the roster. Joining means you claim one of those
          names. Nobody floats unattached.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={onCreate}>
          <Compass className="size-4" />
          Open a trip
        </Button>
        <Button size="lg" variant="outline" onClick={onJoin}>
          <Link2 className="size-4" />
          Join with a link
        </Button>
      </div>
      <Separator />
      {groups.length === 0 ? (
        <EmptyTrips />
      ) : (
        <div className="stagger-children grid gap-3 sm:grid-cols-2">
          {groups.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => onOpen(item.id)}
              className="interactive-card group p-4"
            >
              <p className="font-heading text-2xl transition-colors group-hover:text-primary">
                {item.name}
              </p>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="size-3.5 opacity-70" />
                {item.members.length} people · {item.expenses.length} spends
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyTrips() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No trips on this seat</CardTitle>
        <CardDescription>
          Open one and list every person who will spend. Or ask for the invite
          link from whoever already did.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function CreateTrip({
  profile,
  tripName,
  currency,
  startDate,
  endDate,
  people,
  personDraft,
  busy,
  onTripName,
  onCurrency,
  onStartDate,
  onEndDate,
  onDraft,
  onAddPerson,
  onRemovePerson,
  onBack,
  onSubmit,
}: {
  profile: PublicProfile
  tripName: string
  currency: string
  startDate: string
  endDate: string
  people: string[]
  personDraft: string
  busy: boolean
  onTripName: (value: string) => void
  onCurrency: (value: string) => void
  onStartDate: (value: string) => void
  onEndDate: (value: string) => void
  onDraft: (value: string) => void
  onAddPerson: () => void
  onRemovePerson: (value: string) => void
  onBack: () => void
  onSubmit: () => void
}) {
  const canWrite = Boolean(tripName.trim()) && (people.length >= 2 || personDraft.trim().length > 0)

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="font-heading text-3xl">Name the trip.</CardTitle>
        <CardDescription>
          Be specific. “Goa Diwali 2026” settles. “Goa” fights with the next
          Goa. Nicknames on the roster — two Rahuls? Call one Rahul K. They
          claim those seats later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (canWrite && !busy) onSubmit()
          }}
        >
        <div className="space-y-2">
          <Label htmlFor="trip-name">Trip</Label>
          <Input
            id="trip-name"
            value={tripName}
            placeholder="Manali long weekend"
            onChange={(event) => onTripName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Currency</Label>
          <div className="flex flex-wrap gap-2">
            {["INR", "USD", "EUR", "GBP"].map((item) => (
              <Button
                key={item}
                type="button"
                variant={currency === item ? "default" : "outline"}
                onClick={() => onCurrency(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="trip-start">Start (optional)</Label>
            <Input
              id="trip-start"
              type="date"
              value={startDate}
              onChange={(event) => onStartDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trip-end">End (optional)</Label>
            <Input
              id="trip-end"
              type="date"
              value={endDate}
              onChange={(event) => onEndDate(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="person">Nicknames on the trip</Label>
          <div className="flex gap-2">
            <Input
              id="person"
              value={personDraft}
              placeholder="Add a nickname, press enter"
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  onAddPerson()
                }
              }}
            />
            <Button type="button" variant="outline" onClick={onAddPerson}>
              <Plus />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {people.map((item) => (
              <Badge
                key={item}
                variant={item === profile.name ? "default" : "secondary"}
              >
                {item}
                {item !== profile.name ? (
                  <button
                    type="button"
                    className="ml-1"
                    onClick={() => onRemovePerson(item)}
                  >
                    ×
                  </button>
                ) : null}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            You are already on the list. Type another nickname and write — Enter
            is enough, no extra click.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" disabled={busy || !canWrite}>
            Write the roster
          </Button>
          {!canWrite ? (
            <span className="text-xs text-stamp">
              {!tripName.trim()
                ? "Name the trip first."
                : "Need one more nickname."}
            </span>
          ) : null}
        </div>
        </form>
      </CardContent>
    </Card>
  )
}

function JoinTrip({
  profile,
  code,
  group,
  busy,
  onCode,
  onLookup,
  onClaim,
  onBack,
}: {
  profile: PublicProfile
  code: string
  group: Group | null
  busy: boolean
  onCode: (value: string) => void
  onLookup: () => void
  onClaim: (memberId: string) => void
  onBack: () => void
}) {
  const suggestion = group ? suggestedMember(group, profile.name) : null

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="font-heading text-3xl">Walk into a trip.</CardTitle>
        <CardDescription>
          Paste the invite link someone sent you. Then pick the name that is
          you. If they spelled you wrong, still pick the closest seat — that is
          the match.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={code}
            placeholder="https://…/trip/… or ?join=…"
            onChange={(event) => onCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onLookup()
            }}
          />
          <Button disabled={busy || code.trim().length < 4} onClick={onLookup}>
            Find
          </Button>
        </div>
        {group ? (
          <div className="space-y-3">
            <div>
              <p className="font-heading text-2xl">{group.name}</p>
              <p className="text-sm text-muted-foreground">
                Claim one open name. Occupied seats stay occupied.
              </p>
            </div>
            <div className="space-y-2">
              {group.members.map((member) => {
                const taken = Boolean(member.profileId)
                const mine = member.profileId === profile.id
                const suggested = suggestion?.id === member.id
                return (
                  <button
                    key={member.id}
                    type="button"
                    disabled={busy || (taken && !mine)}
                    onClick={() => onClaim(member.id)}
                    className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left disabled:opacity-50"
                  >
                    <span>
                      {member.name}
                      {suggested ? (
                        <span className="ml-2 text-xs text-moss">looks like you</span>
                      ) : null}
                    </span>
                    <Badge variant={mine ? "default" : taken ? "secondary" : "outline"}>
                      {mine ? "you" : taken ? "taken" : "open"}
                    </Badge>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </CardContent>
    </Card>
  )
}

function TripSummaryStrip({
  group,
  seatId,
}: {
  group: Group
  seatId: string | null
}) {
  const stats = useMemo(() => tripStats(group), [group])
  const personalSpendTotal = useMemo(
    () => (seatId ? personalExpenditureForMember(group, seatId) : 0),
    [group, seatId]
  )
  const mine = seatId ? stats.byMember[seatId] : null
  const net = mine?.net ?? 0
  const balance =
    Math.abs(net) < 0.02
      ? { label: "Balance", text: "Even", className: "text-muted-foreground" }
      : net < 0
        ? {
            label: "You owe",
            text: formatMoney(Math.abs(net), group.currency),
            className: "text-stamp",
          }
        : {
            label: "You're owed",
            text: formatMoney(net, group.currency),
            className: "text-moss",
          }

  return (
    <div className="rounded-xl border bg-card/50 px-3 py-2 lg:px-4 lg:py-2.5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-2">
        <div>
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase lg:text-[11px]">
            Trip spend
          </p>
          <p className="font-heading text-lg lg:text-xl">
            {formatMoney(stats.totalSpend, group.currency)}
          </p>
        </div>
        {seatId && mine ? (
          <>
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Your share
              </p>
              <p className="font-heading text-lg lg:text-xl">
                {formatMoney(mine.share, group.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase lg:text-[11px]">
                You paid (group)
              </p>
              <p className="font-heading text-lg lg:text-xl">
                {formatMoney(mine.paid, group.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase lg:text-[11px]">
                Personal spend
              </p>
              <p className="font-heading text-lg lg:text-xl">
                {formatMoney(personalSpendTotal, group.currency)}
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase lg:text-[11px]">
                {balance.label}
              </p>
              <p className={`font-heading text-lg lg:text-xl ${balance.className}`}>
                {balance.text}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground sm:col-span-3">
            Claim a nickname to see your share, what you paid, and your balance.
          </p>
        )}
      </div>
    </div>
  )
}

export function TripDesk({
  profile,
  group,
  tripPath,
  busy,
  copied,
  expenseOpen,
  memberOpen,
  paymentOpen,
  onExpenseOpen,
  onMemberOpen,
  onPaymentOpen,
  onCopy,
  onRefresh,
  onGroup,
  onError,
  onBusy,
  onClaim,
}: {
  profile: PublicProfile | null
  group: Group
  tripPath: string
  busy: boolean
  copied: boolean
  expenseOpen: boolean
  memberOpen: boolean
  paymentOpen: boolean
  onExpenseOpen: (open: boolean) => void
  onMemberOpen: (open: boolean) => void
  onPaymentOpen: (open: boolean) => void
  onCopy: (value: string) => void
  onRefresh: () => Promise<void>
  onGroup: (group: Group) => void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
  onClaim?: (memberId: string) => void
}) {
  const seat = profile ? mySeat(group, profile.id) : null
  const isOpener = profile ? group.createdByProfileId === profile.id : false
  const canWrite = Boolean(profile && seat)
  const claimSuggestion = profile && !seat ? suggestedMember(group, profile.name) : null
  const balances = useMemo(() => settlementBalances(group), [group])
  const transfers = useMemo(() => simplifyDebts(group), [group])
  const groupLedgerExpenses = useMemo(() => ledgerGroupExpenses(group), [group])
  const personalLedgerExpenses = useMemo(() => ledgerPersonalExpenses(group), [group])
  const personalLedgerPayments = useMemo(() => ledgerPersonalPayments(group), [group])
  const ledgerByDay = useMemo(
    () => expensesByDay(groupLedgerExpenses),
    [groupLedgerExpenses]
  )
  const tripDates = formatTripDates(group)
  const [tripEditOpen, setTripEditOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [draftExpenseDate, setDraftExpenseDate] = useState<string | null>(null)
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<Expense | null>(null)

  function openNewExpense(forDate?: string) {
    setEditingExpense(null)
    setDraftExpenseDate(forDate ?? null)
    onExpenseOpen(true)
  }
  const [importCsvText, setImportCsvText] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const shareUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}${tripPath}`

  useEffect(() => {
    document.title = `${group.name} — Trip Expenses Balancer`
    return () => {
      document.title = "Trip Expenses Balancer"
    }
  }, [group.name])

  const loginHref = `/login?next=${encodeURIComponent(tripPath)}`
  const signupHref = `/signup?next=${encodeURIComponent(tripPath)}`

  return (
    <div className="space-y-4 lg:space-y-3">
      {!profile ? (
        <Alert className="py-2">
          <Users />
          <AlertTitle>Viewing as guest</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Sign in to claim a seat and log spends.</span>
            <Link href={loginHref} className="font-medium underline underline-offset-4">
              Sign in
            </Link>
            <Link href={signupHref} className="font-medium underline underline-offset-4">
              Create account
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 className="font-heading text-2xl tracking-tight sm:text-3xl lg:text-2xl">
              {group.name}
            </h2>
            {tripDates ? (
              <p className="text-sm text-muted-foreground">{tripDates}</p>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {seat
              ? `You: ${seat.name}.`
              : "Claim a nickname to log spends."}
            {isOpener ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setTripEditOpen(true)}
                >
                  Edit trip
                </button>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5 lg:gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              if (typeof navigator !== "undefined" && navigator.share && shareUrl) {
                try {
                  await navigator.share({ title: group.name, url: shareUrl })
                  return
                } catch {
                  /* cancelled or unsupported */
                }
              }
              onCopy(shareUrl)
            }}
          >
            {copied ? <Check /> : <Link2 />}
            {copied ? "Link copied" : "Copy invite link"}
          </Button>
          {profile && isOpener ? (
            <Button variant="outline" onClick={() => downloadTripCsvFile(group)}>
              <Download /> Export CSV
            </Button>
          ) : null}
          {isOpener && profile ? (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return
                  try {
                    const text = await file.text()
                    parseTripCsv(text)
                    setImportCsvText(text)
                  } catch (error) {
                    onError(
                      error instanceof Error ? error.message : "Could not read that CSV."
                    )
                  }
                }}
              />
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload /> Import CSV
              </Button>
            </>
          ) : null}
          {profile ? (
            <>
              <Button
                variant="outline"
                onClick={() => onPaymentOpen(true)}
                disabled={!canWrite}
              >
                <Banknote /> Paid back
              </Button>
              <Button onClick={() => openNewExpense()} disabled={!canWrite}>
                <Receipt /> Add spend
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <TripSummaryStrip group={group} seatId={seat?.id ?? null} />

      <Tabs defaultValue="ledger" className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <TabsList className="shrink-0">
          <TabsTrigger value="settle">Settle</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
        </TabsList>
        <TabsContent
          value="settle"
          className="space-y-2 pt-3 md:max-h-[min(68vh,calc(100dvh-13rem))] md:overflow-y-auto md:overscroll-contain lg:space-y-2 lg:pt-2"
        >
          {transfers.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Books are even</CardTitle>
                <CardDescription>
                  {group.expenses.every((item) => item.voidedAt)
                    ? "No spends yet. Log the first one from the ledger tab."
                    : "Everyone is square on the current ledger."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            transfers.map((transfer, index) => (
              <Card
                key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <CardContent className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    <span className="font-medium">
                      {memberName(group, transfer.fromMemberId)}
                    </span>{" "}
                    pays{" "}
                    <span className="font-medium">
                      {memberName(group, transfer.toMemberId)}
                    </span>
                  </p>
                  <div className="flex items-center gap-3">
                    <p className="font-heading text-2xl">
                      {formatMoney(transfer.amount, group.currency)}
                    </p>
                    {canWrite && profile ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          applyGroupPatchOptimistic({
                            group,
                            profile,
                            body: {
                              action: "add-payment",
                              date: todayIsoDate(),
                              amount: transfer.amount,
                              fromMemberId: transfer.fromMemberId,
                              toMemberId: transfer.toMemberId,
                              profileId: profile.id,
                            },
                            onGroup,
                            onError,
                            onBusy,
                            refresh: onRefresh,
                          })
                        }}
                      >
                        Mark paid
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          {(group.payments ?? []).length > 0 ? (
            <div className="space-y-2">
              <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Paid back
              </p>
              {(group.payments ?? []).map((payment) => {
                const crossed = Boolean(payment.voidedAt)
                const canEdit =
                  profile &&
                  (payment.createdByProfileId === profile.id ||
                    group.createdByProfileId === profile.id)
                return (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <p className={crossed ? "text-muted-foreground line-through" : ""}>
                      {formatDay(payment.date)} ·{" "}
                      {memberName(group, payment.fromMemberId)} →{" "}
                      {memberName(group, payment.toMemberId)} ·{" "}
                      {formatMoney(payment.amount, group.currency)}
                    </p>
                    {canEdit ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          applyGroupPatchOptimistic({
                            group,
                            profile,
                            body: {
                              action: "void-payment",
                              paymentId: payment.id,
                              profileId: profile.id,
                              restore: crossed,
                            },
                            onGroup,
                            onError,
                            onBusy,
                            refresh: onRefresh,
                          })
                        }}
                      >
                        {crossed ? "Count again" : "Cross out"}
                      </Button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.members.map((member) => {
              const value = balances[member.id] ?? 0
              return (
                <div
                  key={member.id}
                  className="interactive-row flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-sm lg:px-3 lg:py-2"
                >
                  <span>
                    {member.name}
                    {profile && member.profileId === profile.id ? " · you" : ""}
                  </span>
                  <span className={value >= 0 ? "text-moss" : "text-stamp"}>
                    {value >= 0 ? "is owed " : "owes "}
                    {formatMoney(Math.abs(value), group.currency)}
                  </span>
                </div>
              )
            })}
          </div>
        </TabsContent>
        <TabsContent
          value="ledger"
          className="space-y-4 pt-3 md:max-h-[min(68vh,calc(100dvh-13rem))] md:overflow-y-auto md:overscroll-contain lg:space-y-3 lg:pt-2"
        >
          {groupLedgerExpenses.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No group spends yet</CardTitle>
                <CardDescription>
                  Shared bills appear here by day (oldest first). Personal spends and paid-back
                  transfers are listed below.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            ledgerByDay.map((day) => (
              <section key={day.date} className="space-y-3">
                <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b bg-background/95 py-1.5 backdrop-blur-sm">
                  <h3 className="font-heading text-base">{formatDay(day.date)}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {canWrite ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => openNewExpense(day.date)}
                      >
                        <Receipt className="size-3.5" />
                        Add expense for {formatDayDots(day.date)}
                      </Button>
                    ) : null}
                    <p className="font-heading text-base tabular-nums">
                      {formatMoney(day.total, group.currency)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {day.expenses.map((expense) => {
                    const canEdit =
                      profile &&
                      (expense.createdByProfileId === profile.id ||
                        group.createdByProfileId === profile.id)
                    const splitLabel = expense.participantIds
                      .map((id) => memberName(group, id))
                      .join(", ")
                    return (
                      <Card
                        key={expense.id}
                        size="sm"
                        className="flex flex-col motion-safe:active:scale-[0.99]"
                      >
                        <CardContent className="flex flex-1 flex-col gap-1.5 pt-1">
                          <p className="font-heading text-xl leading-none tabular-nums lg:text-2xl">
                            {formatMoney(expense.amount, group.currency)}
                          </p>
                          <Badge variant="secondary" className="w-fit text-sm">
                            Paid by {memberName(group, expense.paidByMemberId)}
                          </Badge>
                          <p className="truncate font-medium leading-snug">
                            {expense.reason}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Split: {splitLabel}
                          </p>
                        </CardContent>
                        {canEdit ? (
                          <CardFooter className="mt-auto gap-1 border-0 bg-transparent py-0">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              aria-label="Edit spend"
                              onClick={() => {
                                setEditingExpense(expense)
                                onExpenseOpen(true)
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              aria-label="Delete spend"
                              onClick={() => setDeleteExpenseTarget(expense)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </CardFooter>
                        ) : null}
                      </Card>
                    )
                  })}
                </div>
              </section>
            ))
          )}
          {personalLedgerExpenses.length > 0 || personalLedgerPayments.length > 0 ? (
            <section className="space-y-2 border-t pt-4">
              <div>
                <h3 className="font-heading text-base">Personal &amp; paid back</h3>
                <p className="text-sm text-muted-foreground">
                  Not mixed into group splits. Personal rows count toward your personal spend total
                  only.
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personalLedgerExpenses.map((expense) => (
                      <tr key={expense.id} className="border-b last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDay(expense.date)}</td>
                        <td className="px-3 py-2">Personal</td>
                        <td className="px-3 py-2">
                          {expense.reason} · paid by{" "}
                          {memberName(group, expense.paidByMemberId)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(expense.amount, group.currency)}
                        </td>
                      </tr>
                    ))}
                    {personalLedgerPayments.map((payment) => (
                      <tr key={payment.id} className="border-b last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDay(payment.date)}</td>
                        <td className="px-3 py-2">Paid back</td>
                        <td className="px-3 py-2">
                          {memberName(group, payment.fromMemberId)} →{" "}
                          {memberName(group, payment.toMemberId)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(payment.amount, group.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </TabsContent>
        <TabsContent
          value="people"
          className="space-y-2 pt-3 md:max-h-[min(68vh,calc(100dvh-13rem))] md:overflow-y-auto md:overscroll-contain lg:pt-2"
        >
          {group.members.map((member) => {
            const cover = member.coveredByMemberId
              ? group.members.find((item) => item.id === member.coveredByMemberId)
              : null
            const settlesFor = group.members.filter(
              (item) => item.coveredByMemberId === member.id
            )
            const balance = balances[member.id] ?? 0
            return (
              <div
                key={member.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {member.name}
                    {profile && member.profileId === profile.id ? " · you" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {member.profileId
                      ? "Nickname matched to a profile"
                      : "Open nickname — they still need to claim"}
                  </p>
                  {cover ? (
                    <Badge variant="secondary" className="w-fit">
                      Covered by {cover.name}
                    </Badge>
                  ) : null}
                  {settlesFor.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Also settles for{" "}
                      {settlesFor.map((item) => item.name).join(", ")}
                    </p>
                  ) : null}
                  {!cover && Math.abs(balance) > 0.005 ? (
                    <p className="text-xs">
                      <span className={balance >= 0 ? "text-moss" : "text-stamp"}>
                        {balance >= 0 ? "Is owed " : "Owes "}
                        {formatMoney(Math.abs(balance), group.currency)}
                      </span>
                      <span className="text-muted-foreground"> (cash settle)</span>
                    </p>
                  ) : null}
                </div>
                {canWrite && profile ? (
                <label className="flex shrink-0 flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Settles cash</span>
                  <select
                    className="rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                    disabled={busy}
                    value={member.coveredByMemberId ?? member.id}
                    onChange={(event) => {
                      const picked = event.target.value
                      applyGroupPatchOptimistic({
                        group,
                        profile,
                        body: {
                          action: "cover-member",
                          memberId: member.id,
                          coveredByMemberId:
                            picked === member.id ? null : picked,
                          profileId: profile.id,
                        },
                        onGroup,
                        onError,
                        onBusy,
                        refresh: onRefresh,
                      })
                    }}
                  >
                    <option value={member.id}>Themselves</option>
                    {group.members
                      .filter((item) => item.id !== member.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                ) : null}
              </div>
            )
          })}
          {profile && !seat && onClaim ? (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Claim your seat</p>
              <p className="text-xs text-muted-foreground">
                Pick the nickname that is you on this trip.
              </p>
              <div className="flex flex-wrap gap-2">
                {group.members.map((member) => {
                  if (member.profileId) return null
                  const suggested = claimSuggestion?.id === member.id
                  return (
                    <Button
                      key={member.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => onClaim(member.id)}
                    >
                      {member.name}
                      {suggested ? " · looks like you" : ""}
                    </Button>
                  )
                })}
              </div>
            </div>
          ) : null}
          {canWrite ? (
            <Button variant="outline" onClick={() => onMemberOpen(true)}>
              <Plus /> Add a nickname
            </Button>
          ) : null}
        </TabsContent>
      </Tabs>

      {profile ? (
        <TripEditDialog
          open={tripEditOpen}
          group={group}
          profile={profile}
          busy={busy}
          onOpen={setTripEditOpen}
          onSaved={(next) => {
            onGroup(next)
            setTripEditOpen(false)
          }}
          onError={onError}
          onBusy={onBusy}
        />
      ) : null}
      <Dialog
        open={Boolean(importCsvText)}
        onOpenChange={(open) => {
          if (!open) setImportCsvText(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import trip CSV?</DialogTitle>
            <DialogDescription>
              This replaces everyone on the roster, every spend, and every paid-back
              entry on this trip. Trip code and invite link stay the same.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportCsvText(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !importCsvText}
              onClick={() => {
                if (!importCsvText || !profile) return
                const csv = importCsvText
                applyGroupPatchOptimistic({
                  group,
                  profile,
                  body: {
                    action: "import-trip-csv",
                    csv,
                    profileId: profile.id,
                  },
                  onGroup,
                  onError,
                  onBusy,
                  onDone: () => setImportCsvText(null),
                  refresh: onRefresh,
                })
              }}
            >
              Replace from CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleteExpenseTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteExpenseTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this spend?</DialogTitle>
            <DialogDescription>
              {deleteExpenseTarget
                ? `“${deleteExpenseTarget.reason}” will be removed from the trip ledger.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteExpenseTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !deleteExpenseTarget}
              onClick={() => {
                if (!deleteExpenseTarget || !profile) return
                const expenseId = deleteExpenseTarget.id
                applyGroupPatchOptimistic({
                  group,
                  profile,
                  body: {
                    action: "delete-expense",
                    expenseId,
                    profileId: profile.id,
                  },
                  onGroup,
                  onError,
                  onBusy,
                  onDone: () => setDeleteExpenseTarget(null),
                  refresh: onRefresh,
                })
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {profile ? (
        <>
          <ExpenseDialog
            open={expenseOpen}
            expense={editingExpense}
            defaultDate={editingExpense ? null : draftExpenseDate}
            group={group}
            profile={profile}
            busy={busy}
            onOpen={(open) => {
              onExpenseOpen(open)
              if (!open) {
                setEditingExpense(null)
                setDraftExpenseDate(null)
              }
            }}
            onSaved={() => {
              onExpenseOpen(false)
              setEditingExpense(null)
              setDraftExpenseDate(null)
            }}
            onGroup={onGroup}
            onRefresh={onRefresh}
            onError={onError}
            onBusy={onBusy}
          />
          <MemberDialog
            open={memberOpen}
            group={group}
            profile={profile}
            busy={busy}
            onOpen={onMemberOpen}
            onSaved={(next) => {
              onGroup(next)
              onMemberOpen(false)
            }}
            onRefresh={onRefresh}
            onError={onError}
            onBusy={onBusy}
          />
          <PaymentDialog
            open={paymentOpen}
            group={group}
            profile={profile}
            busy={busy}
            onOpen={onPaymentOpen}
            onSaved={(next) => {
              onGroup(next)
              onPaymentOpen(false)
            }}
            onRefresh={onRefresh}
            onError={onError}
            onBusy={onBusy}
          />
        </>
      ) : null}
    </div>
  )
}

function TripEditDialog({
  open,
  group,
  profile,
  busy,
  onOpen,
  onSaved,
  onError,
  onBusy,
}: {
  open: boolean
  group: Group
  profile: PublicProfile
  busy: boolean
  onOpen: (open: boolean) => void
  onSaved: (group: Group) => void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      {open ? (
        <TripEditForm
          key={`${group.id}-${group.name}-${group.startDate ?? ""}-${group.endDate ?? ""}`}
          group={group}
          profile={profile}
          busy={busy}
          onSaved={onSaved}
          onError={onError}
          onBusy={onBusy}
        />
      ) : null}
    </Dialog>
  )
}

function TripEditForm({
  group,
  profile,
  busy,
  onSaved,
  onError,
  onBusy,
}: {
  group: Group
  profile: PublicProfile
  busy: boolean
  onSaved: (group: Group) => void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  const [name, setName] = useState(group.name)
  const [startDate, setStartDate] = useState(group.startDate ?? "")
  const [endDate, setEndDate] = useState(group.endDate ?? "")

  return (
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit trip details</DialogTitle>
          <DialogDescription>Name and dates — currency stays as set when the trip opened.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-trip-name">Trip name</Label>
            <Input
              id="edit-trip-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start">Start</Label>
              <Input
                id="edit-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-end">End</Label>
              <Input
                id="edit-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => {
              applyGroupPatchOptimistic({
                group,
                profile,
                body: {
                  action: "update-group",
                  profileId: profile.id,
                  name: name.trim(),
                  startDate: startDate.trim() || null,
                  endDate: endDate.trim() || null,
                },
                onGroup: onSaved,
                onError,
                onBusy,
              })
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
  )
}

function ExpenseDialog({
  open,
  expense,
  defaultDate,
  group,
  profile,
  busy,
  onOpen,
  onSaved,
  onGroup,
  onRefresh,
  onError,
  onBusy,
}: {
  open: boolean
  expense: Expense | null
  defaultDate?: string | null
  group: Group
  profile: PublicProfile
  busy: boolean
  onOpen: (open: boolean) => void
  onSaved: () => void
  onGroup: (group: Group) => void
  onRefresh: () => Promise<void>
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      {open ? (
        <ExpenseForm
          key={expense?.id ?? `new-${defaultDate ?? "today"}`}
          expense={expense}
          defaultDate={defaultDate}
          group={group}
          profile={profile}
          busy={busy}
          onSaved={onSaved}
          onGroup={onGroup}
          onRefresh={onRefresh}
          onError={onError}
          onBusy={onBusy}
        />
      ) : null}
    </Dialog>
  )
}

function ExpenseForm({
  group,
  profile,
  expense,
  defaultDate,
  busy,
  onSaved,
  onGroup,
  onRefresh,
  onError,
  onBusy,
}: {
  group: Group
  profile: PublicProfile
  expense: Expense | null
  defaultDate?: string | null
  busy: boolean
  onSaved: () => void
  onGroup: (group: Group) => void
  onRefresh: () => Promise<void>
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  const seat = mySeat(group, profile.id)
  const isEdit = Boolean(expense)
  const [date, setDate] = useState(expense?.date ?? defaultDate ?? todayIsoDate())
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "")
  const [reason, setReason] = useState(expense?.reason ?? "")
  const [paidBy, setPaidBy] = useState(
    expense?.paidByMemberId ?? seat?.id ?? group.members[0]?.id ?? ""
  )
  const [participants, setParticipants] = useState<string[]>(
    expense?.participantIds ?? group.members.map((member) => member.id)
  )

  function toggle(id: string, checked: boolean) {
    setParticipants(
      checked
        ? [...new Set([...participants, id])]
        : participants.filter((item) => item !== id)
    )
  }

  return (
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit spend" : "Log a spend"}</DialogTitle>
          <DialogDescription>
            Uncheck anyone who was not on this bill. The amount splits equally
            among everyone checked.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="2400"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              placeholder="Airport cabs + toll"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Who paid</Label>
            <div className="flex flex-wrap gap-2">
              {group.members.map((member) => (
                <Button
                  key={member.id}
                  variant={paidBy === member.id ? "default" : "outline"}
                  onClick={() => setPaidBy(member.id)}
                >
                  {member.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>On the bill</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setParticipants(
                    participants.length === group.members.length
                      ? [paidBy]
                      : group.members.map((member) => member.id)
                  )
                }
              >
                {participants.length === group.members.length ? "Only payer" : "Everyone"}
              </Button>
            </div>
            <div className="space-y-2">
              {group.members.map((member) => (
                <label key={member.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={participants.includes(member.id)}
                    onCheckedChange={(value) => toggle(member.id, value === true)}
                  />
                  <span className="flex-1">{member.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => {
              const parsed = parseAmount(amount)
              if (!parsed) {
                onError("Amount has to be a real number.")
                return
              }
              const payload = {
                date,
                amount: parsed,
                reason,
                paidByMemberId: paidBy,
                participantIds: participants,
                split: "equal" as const,
                shares: {} as Record<string, number>,
                profileId: profile.id,
              }
              applyGroupPatchOptimistic({
                group,
                profile,
                body:
                  isEdit && expense
                    ? {
                        action: "update-expense",
                        ...payload,
                        expenseId: expense.id,
                      }
                    : { action: "add-expense", ...payload },
                onGroup,
                onError,
                onBusy,
                onDone: onSaved,
                refresh: onRefresh,
              })
            }}
          >
            {isEdit ? "Save changes" : "Save spend"}
          </Button>
        </DialogFooter>
      </DialogContent>
  )
}

function MemberDialog({
  open,
  group,
  profile,
  busy,
  onOpen,
  onSaved,
  onRefresh,
  onError,
  onBusy,
}: {
  open: boolean
  group: Group
  profile: PublicProfile
  busy: boolean
  onOpen: (open: boolean) => void
  onSaved: (group: Group) => void
  onRefresh: () => Promise<void>
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      {open ? (
        <MemberForm
          group={group}
          profile={profile}
          busy={busy}
          onSaved={onSaved}
          onRefresh={onRefresh}
          onError={onError}
          onBusy={onBusy}
        />
      ) : null}
    </Dialog>
  )
}

function MemberForm({
  group,
  profile,
  busy,
  onSaved,
  onRefresh,
  onError,
  onBusy,
}: {
  group: Group
  profile: PublicProfile
  busy: boolean
  onSaved: (group: Group) => void
  onRefresh: () => Promise<void>
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  const [name, setName] = useState("")

  return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a nickname</DialogTitle>
          <DialogDescription>
            Empty seat. Two Rahuls? Call one Rahul K. They match it when they
            make their profile and enter the code.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          placeholder="Nickname"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault()
          }}
        />
        <DialogFooter>
          <Button
            disabled={busy || !name.trim()}
            onClick={() => {
              applyGroupPatchOptimistic({
                group,
                profile,
                body: { action: "add-member", name },
                onGroup: onSaved,
                onError,
                onBusy,
                refresh: onRefresh,
              })
            }}
          >
            Add seat
          </Button>
        </DialogFooter>
      </DialogContent>
  )
}

function PaymentDialog({
  open,
  group,
  profile,
  busy,
  onOpen,
  onSaved,
  onRefresh,
  onError,
  onBusy,
}: {
  open: boolean
  group: Group
  profile: PublicProfile
  busy: boolean
  onOpen: (open: boolean) => void
  onSaved: (group: Group) => void
  onRefresh: () => Promise<void>
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      {open ? (
        <PaymentForm
          group={group}
          profile={profile}
          busy={busy}
          onSaved={onSaved}
          onRefresh={onRefresh}
          onError={onError}
          onBusy={onBusy}
        />
      ) : null}
    </Dialog>
  )
}

function PaymentForm({
  group,
  profile,
  busy,
  onSaved,
  onRefresh,
  onError,
  onBusy,
}: {
  group: Group
  profile: PublicProfile
  busy: boolean
  onSaved: (group: Group) => void
  onRefresh: () => Promise<void>
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  const seat = mySeat(group, profile.id)
  const [date, setDate] = useState(todayIsoDate())
  const [amount, setAmount] = useState("")
  const [fromId, setFromId] = useState(seat?.id ?? group.members[0]?.id ?? "")
  const [toId, setToId] = useState(
    group.members.find((member) => member.id !== (seat?.id ?? group.members[0]?.id))
      ?.id ?? ""
  )

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Record paid back</DialogTitle>
        <DialogDescription>
          Someone handed cash. This cuts the open tab. Cross it out later if
          that was a mistake.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Date</Label>
            <Input
              id="pay-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount</Label>
            <Input
              id="pay-amount"
              inputMode="decimal"
              placeholder="800"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Who paid</Label>
          <div className="flex flex-wrap gap-2">
            {group.members.map((member) => (
              <Button
                key={member.id}
                variant={fromId === member.id ? "default" : "outline"}
                onClick={() => setFromId(member.id)}
              >
                {member.name}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Who received</Label>
          <div className="flex flex-wrap gap-2">
            {group.members.map((member) => (
              <Button
                key={member.id}
                variant={toId === member.id ? "default" : "outline"}
                onClick={() => setToId(member.id)}
              >
                {member.name}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={busy}
          onClick={async () => {
            const parsed = parseAmount(amount)
            if (!parsed) {
              onError("Amount has to be a real number.")
              return
            }
            applyGroupPatchOptimistic({
              group,
              profile,
              body: {
                action: "add-payment",
                date,
                amount: parsed,
                fromMemberId: fromId,
                toMemberId: toId,
                profileId: profile.id,
              },
              onGroup: onSaved,
              onError,
              onBusy,
              refresh: onRefresh,
            })
          }}
        >
          Save payment
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
