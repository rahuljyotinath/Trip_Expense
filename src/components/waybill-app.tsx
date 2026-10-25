"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Check,
  Copy,
  Link2,
  Plus,
  Receipt,
  Users,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
  clearSavedProfile,
  createUserProfile,
  fetchGroup,
  fetchGroupByCode,
  fetchMyGroups,
  fetchProfile,
  inviteName,
  loadHealth,
  loadSavedProfile,
  crossExpense,
  crossPayment,
  openTrip,
  recordPayment,
  saveExpense,
  type Health,
} from "@/lib/client-api"
import { todayIsoDate } from "@/lib/ids"
import { formatMoney, parseAmount } from "@/lib/money"
import { suggestedMember } from "@/lib/operations"
import { netBalances, simplifyDebts } from "@/lib/settle"
import { evenPercents, shareTotal, sharesComplete } from "@/lib/shares"
import type { Group, Profile, SplitMode } from "@/lib/types"

type Screen = "boot" | "name" | "home" | "create" | "join" | "trip"

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

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "That failed."
}

export function WaybillApp() {
  const searchParams = useSearchParams()
  const joinFromUrl = (searchParams.get("join") ?? "").toUpperCase()

  const [screen, setScreen] = useState<Screen>("boot")
  const [health, setHealth] = useState<Health | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [group, setGroup] = useState<Group | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState("")
  const [tripName, setTripName] = useState("")
  const [currency, setCurrency] = useState("INR")
  const [people, setPeople] = useState<string[]>([])
  const [personDraft, setPersonDraft] = useState("")
  const [code, setCode] = useState(joinFromUrl)
  const [joinGroup, setJoinGroup] = useState<Group | null>(null)

  const [expenseOpen, setExpenseOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function refreshGroups(nextProfile: Profile) {
    const list = await fetchMyGroups(nextProfile.id)
    setGroups(list)
    return list
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const nextHealth = await loadHealth()
        if (cancelled) return
        setHealth(nextHealth)
        const saved = loadSavedProfile()
        if (!saved) {
          setScreen("name")
          return
        }
        try {
          const verified = await fetchProfile(saved.id)
          if (cancelled) return
          setProfile(verified)
          await refreshGroups(verified)
          if (joinFromUrl) {
            setCode(joinFromUrl)
            setScreen("join")
            return
          }
          setScreen("home")
        } catch {
          clearSavedProfile()
          if (!cancelled) setScreen("name")
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorText(err))
          setScreen("name")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [joinFromUrl])

  async function onCreateProfile() {
    setBusy(true)
    setError(null)
    try {
      const next = await createUserProfile(name)
      setProfile(next)
      await refreshGroups(next)
      setScreen(joinFromUrl || code ? "join" : "home")
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
      })
      setGroup(next)
      await refreshGroups(profile)
      setScreen("trip")
      setTripName("")
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
      const next = await fetchGroupByCode(code)
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
      setGroup(next)
      setJoinGroup(null)
      await refreshGroups(profile)
      setScreen("trip")
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function openExisting(id: string) {
    setBusy(true)
    setError(null)
    try {
      const next = await fetchGroup(id)
      setGroup(next)
      setScreen("trip")
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function copyCode(value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  if (screen === "boot") {
    return (
      <Shell health={health} profile={profile}>
        <p className="text-muted-foreground">Opening the ledger…</p>
      </Shell>
    )
  }

  return (
    <Shell
      health={health}
      profile={profile}
      onHome={() => {
        setScreen("home")
        setGroup(null)
        setError(null)
      }}
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>Hold on</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {screen === "name" ? (
        <NameGate
          name={name}
          busy={busy}
          onName={setName}
          onSubmit={onCreateProfile}
        />
      ) : null}

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
          people={people}
          personDraft={personDraft}
          busy={busy}
          onTripName={setTripName}
          onCurrency={setCurrency}
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

      {screen === "trip" && profile && group ? (
        <TripDesk
          profile={profile}
          group={group}
          busy={busy}
          copied={copied}
          expenseOpen={expenseOpen}
          memberOpen={memberOpen}
          paymentOpen={paymentOpen}
          onExpenseOpen={setExpenseOpen}
          onMemberOpen={setMemberOpen}
          onPaymentOpen={setPaymentOpen}
          onCopy={copyCode}
          onRefresh={async () => {
            const next = await fetchGroup(group.id)
            setGroup(next)
            await refreshGroups(profile)
          }}
          onGroup={setGroup}
          onError={setError}
          onBusy={setBusy}
        />
      ) : null}
    </Shell>
  )
}

function Shell({
  children,
  health,
  profile,
  onHome,
}: {
  children: React.ReactNode
  health: Health | null
  profile: Profile | null
  onHome?: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onHome}
          className="text-left"
          disabled={!onHome}
        >
          <p className="font-mono text-[11px] tracking-[0.22em] text-stamp uppercase">
            Group ledger
          </p>
          <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">Waybill</h1>
        </button>
        <div className="text-right text-sm">
          {profile ? (
            <p className="font-medium">{profile.name}</p>
          ) : (
            <p className="text-muted-foreground">No seat yet</p>
          )}
          <p className="font-mono text-[11px] text-muted-foreground uppercase">
            {health?.mode === "github"
              ? `GitHub · ${health.repo}`
              : health?.mode === "local"
                ? "Local file"
                : health?.mode === "unconfigured"
                  ? "This browser"
                  : "…"}
          </p>
        </div>
      </header>
      {health?.warning ? (
        <Alert className="mb-4">
          <AlertCircle />
          <AlertTitle>Storage</AlertTitle>
          <AlertDescription>{health.warning}</AlertDescription>
        </Alert>
      ) : null}
      <main className="flex-1">{children}</main>
    </div>
  )
}

function NameGate({
  name,
  busy,
  onName,
  onSubmit,
}: {
  name: string
  busy: boolean
  onName: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="font-heading text-3xl">What should we call you?</CardTitle>
        <CardDescription>
          This is your seat. Later you match it to a name on a trip. No password.
          The browser remembers you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Your name</Label>
          <Input
            id="profile-name"
            value={name}
            autoFocus
            placeholder="Priya Sharma"
            onChange={(event) => onName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmit()
            }}
          />
        </div>
        <Button disabled={busy || !name.trim()} onClick={onSubmit} size="lg">
          Sit down <ArrowRight />
        </Button>
      </CardContent>
    </Card>
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
  profile: Profile
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
          Open a trip
        </Button>
        <Button size="lg" variant="outline" onClick={onJoin}>
          I have a code
        </Button>
      </div>
      <Separator />
      {groups.length === 0 ? (
        <EmptyTrips />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => onOpen(item.id)}
              className="rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition hover:ring-foreground/30"
            >
              <p className="font-heading text-2xl">{item.name}</p>
              <p className="mt-1 font-mono text-xs tracking-widest">{item.code}</p>
              <p className="mt-3 text-sm text-muted-foreground">
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
          Open one and list every person who will spend. Or take a six-letter
          code from whoever already did.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function CreateTrip({
  profile,
  tripName,
  currency,
  people,
  personDraft,
  busy,
  onTripName,
  onCurrency,
  onDraft,
  onAddPerson,
  onRemovePerson,
  onBack,
  onSubmit,
}: {
  profile: Profile
  tripName: string
  currency: string
  people: string[]
  personDraft: string
  busy: boolean
  onTripName: (value: string) => void
  onCurrency: (value: string) => void
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
  profile: Profile
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
          Six letters. Then pick the name that is you. If they spelled you
          wrong, still pick the closest seat — that is the match.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={code}
            placeholder="K7MP2Q"
            className="font-mono uppercase tracking-[0.3em]"
            onChange={(event) => onCode(event.target.value.toUpperCase())}
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

function TripDesk({
  profile,
  group,
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
}: {
  profile: Profile
  group: Group
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
}) {
  const seat = mySeat(group, profile.id)
  const balances = useMemo(() => netBalances(group), [group])
  const transfers = useMemo(() => simplifyDebts(group), [group])
  const shareUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/?join=${group.code}`

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
            Trip
          </p>
          <h2 className="font-heading text-4xl">{group.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {seat
              ? `You are seated as ${seat.name}.`
              : "You can look, but claim a name before logging spends."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onCopy(group.code)}>
            {copied ? <Check /> : <Copy />}
            {group.code}
          </Button>
          <Button variant="outline" onClick={() => onCopy(shareUrl)}>
            <Link2 /> Share
          </Button>
          <Button
            variant="outline"
            onClick={() => onPaymentOpen(true)}
            disabled={!seat}
          >
            <Banknote /> Paid back
          </Button>
          <Button onClick={() => onExpenseOpen(true)} disabled={!seat}>
            <Receipt /> Add spend
          </Button>
        </div>
      </div>

      <Tabs defaultValue="settle">
        <TabsList>
          <TabsTrigger value="settle">Settle</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
        </TabsList>
        <TabsContent value="settle" className="space-y-3 pt-4">
          {transfers.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Books are even</CardTitle>
                <CardDescription>
                  {group.expenses.every((item) => item.voidedAt)
                    ? "No live spends. First dinner, or uncross a line."
                    : "Everyone is square on the current ledger."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            transfers.map((transfer) => (
              <Card key={`${transfer.fromMemberId}-${transfer.toMemberId}`}>
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
                    {seat ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          onBusy(true)
                          onError(null)
                          try {
                            onGroup(
                              await recordPayment(group.id, {
                                date: todayIsoDate(),
                                amount: transfer.amount,
                                fromMemberId: transfer.fromMemberId,
                                toMemberId: transfer.toMemberId,
                                profileId: profile.id,
                              })
                            )
                          } catch (err) {
                            onError(errorText(err))
                          } finally {
                            onBusy(false)
                          }
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
                  payment.createdByProfileId === profile.id ||
                  group.createdByProfileId === profile.id
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
                        onClick={async () => {
                          onBusy(true)
                          onError(null)
                          try {
                            onGroup(
                              await crossPayment(
                                group.id,
                                payment.id,
                                profile.id,
                                crossed
                              )
                            )
                          } catch (err) {
                            onError(errorText(err))
                          } finally {
                            onBusy(false)
                          }
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
          <div className="grid gap-2 sm:grid-cols-2">
            {group.members.map((member) => {
              const value = balances[member.id] ?? 0
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span>
                    {member.name}
                    {member.profileId === profile.id ? " · you" : ""}
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
        <TabsContent value="ledger" className="space-y-3 pt-4">
          {group.expenses.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Blank page</CardTitle>
                <CardDescription>
                  Date, amount, reason, who is on the bill. One person or
                  everyone.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            group.expenses.map((expense) => {
              const crossed = Boolean(expense.voidedAt)
              const canEdit =
                expense.createdByProfileId === profile.id ||
                group.createdByProfileId === profile.id
              return (
              <Card key={expense.id} className={crossed ? "opacity-70" : ""}>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className={crossed ? "line-through" : ""}>
                      {expense.reason}
                    </CardTitle>
                    <CardDescription className={crossed ? "line-through" : ""}>
                      {formatDay(expense.date)} · paid by{" "}
                      {memberName(group, expense.paidByMemberId)}
                      {expense.split === "percent" ? " · percent" : " · equal"}
                    </CardDescription>
                  </div>
                  <p className={`font-heading text-2xl ${crossed ? "line-through" : ""}`}>
                    {formatMoney(expense.amount, group.currency)}
                  </p>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3">
                  <p className={`text-sm text-muted-foreground ${crossed ? "line-through" : ""}`}>
                    {expense.split === "percent"
                      ? expense.participantIds
                          .map(
                            (id) =>
                              `${expense.shares[id] ?? 0}% ${memberName(group, id)}`
                          )
                          .join(" · ")
                      : expense.participantIds
                          .map((id) => memberName(group, id))
                          .join(", ")}
                  </p>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        onBusy(true)
                        onError(null)
                        try {
                          onGroup(
                            await crossExpense(
                              group.id,
                              expense.id,
                              profile.id,
                              crossed
                            )
                          )
                        } catch (err) {
                          onError(errorText(err))
                        } finally {
                          onBusy(false)
                        }
                      }}
                    >
                      {crossed ? "Count again" : "Cross out"}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
              )
            })
          )}
        </TabsContent>
        <TabsContent value="people" className="space-y-3 pt-4">
          {group.members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
            >
              <div>
                <p className="font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">
                  {member.profileId
                    ? "Nickname matched to a profile"
                    : "Open nickname — they still need to claim"}
                </p>
              </div>
              <Users className="size-4 text-muted-foreground" />
            </div>
          ))}
          <Button variant="outline" onClick={() => onMemberOpen(true)}>
            <Plus /> Add a nickname
          </Button>
        </TabsContent>
      </Tabs>

      <ExpenseDialog
        open={expenseOpen}
        group={group}
        profile={profile}
        busy={busy}
        onOpen={onExpenseOpen}
        onSaved={async (next) => {
          onGroup(next)
          onExpenseOpen(false)
          await onRefresh()
        }}
        onError={onError}
        onBusy={onBusy}
      />
      <MemberDialog
        open={memberOpen}
        group={group}
        busy={busy}
        onOpen={onMemberOpen}
        onSaved={(next) => {
          onGroup(next)
          onMemberOpen(false)
        }}
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
        onError={onError}
        onBusy={onBusy}
      />
    </div>
  )
}

function ExpenseDialog({
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
  profile: Profile
  busy: boolean
  onOpen: (open: boolean) => void
  onSaved: (group: Group) => Promise<void> | void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      {open ? (
        <ExpenseForm
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

function ExpenseForm({
  group,
  profile,
  busy,
  onSaved,
  onError,
  onBusy,
}: {
  group: Group
  profile: Profile
  busy: boolean
  onSaved: (group: Group) => Promise<void> | void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  const seat = mySeat(group, profile.id)
  const [date, setDate] = useState(todayIsoDate())
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [paidBy, setPaidBy] = useState(seat?.id ?? group.members[0]?.id ?? "")
  const [participants, setParticipants] = useState<string[]>(
    group.members.map((member) => member.id)
  )
  const [split, setSplit] = useState<SplitMode>("equal")
  const [shares, setShares] = useState<Record<string, number>>(
    evenPercents(group.members.map((member) => member.id))
  )

  function setPeople(next: string[]) {
    setParticipants(next)
    setShares(evenPercents(next))
  }

  function toggle(id: string, checked: boolean) {
    const next = checked
      ? [...new Set([...participants, id])]
      : participants.filter((item) => item !== id)
    setPeople(next)
  }

  return (
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a spend</DialogTitle>
          <DialogDescription>
            Uncheck anyone who was not on this bill. Equal split or percents
            that add to 100.
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
                  setPeople(
                    participants.length === group.members.length
                      ? [paidBy]
                      : group.members.map((member) => member.id)
                  )
                }
              >
                {participants.length === group.members.length ? "Only payer" : "Everyone"}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant={split === "equal" ? "default" : "outline"}
                onClick={() => {
                  setSplit("equal")
                  setShares(evenPercents(participants))
                }}
              >
                Equal
              </Button>
              <Button
                variant={split === "percent" ? "default" : "outline"}
                onClick={() => {
                  setSplit("percent")
                  setShares(evenPercents(participants))
                }}
              >
                Percent
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
                  {split === "percent" && participants.includes(member.id) ? (
                    <Input
                      className="h-7 w-20"
                      inputMode="decimal"
                      value={shares[member.id] ?? ""}
                      onChange={(event) =>
                        setShares((current) => ({
                          ...current,
                          [member.id]: Number(event.target.value),
                        }))
                      }
                    />
                  ) : null}
                </label>
              ))}
            </div>
            {split === "percent" ? (
              <p
                className={`text-xs ${
                  sharesComplete(participants, shares)
                    ? "text-moss"
                    : "text-stamp"
                }`}
              >
                {shareTotal(participants, shares) / 100}% total
                {sharesComplete(participants, shares) ? "" : " — must be 100"}
              </p>
            ) : null}
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
              onBusy(true)
              onError(null)
              try {
                if (split === "percent" && !sharesComplete(participants, shares)) {
                  onError("Percents must add to 100.")
                  return
                }
                const next = await saveExpense(group.id, {
                  date,
                  amount: parsed,
                  reason,
                  paidByMemberId: paidBy,
                  participantIds: participants,
                  split,
                  shares: split === "percent" ? shares : {},
                  profileId: profile.id,
                })
                await onSaved(next)
              } catch (err) {
                onError(errorText(err))
              } finally {
                onBusy(false)
              }
            }}
          >
            Save spend
          </Button>
        </DialogFooter>
      </DialogContent>
  )
}

function MemberDialog({
  open,
  group,
  busy,
  onOpen,
  onSaved,
  onError,
  onBusy,
}: {
  open: boolean
  group: Group
  busy: boolean
  onOpen: (open: boolean) => void
  onSaved: (group: Group) => void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      {open ? (
        <MemberForm
          group={group}
          busy={busy}
          onSaved={onSaved}
          onError={onError}
          onBusy={onBusy}
        />
      ) : null}
    </Dialog>
  )
}

function MemberForm({
  group,
  busy,
  onSaved,
  onError,
  onBusy,
}: {
  group: Group
  busy: boolean
  onSaved: (group: Group) => void
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
            onClick={async () => {
              onBusy(true)
              onError(null)
              try {
                onSaved(await inviteName(group.id, name))
              } catch (err) {
                onError(errorText(err))
              } finally {
                onBusy(false)
              }
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
  onError,
  onBusy,
}: {
  open: boolean
  group: Group
  profile: Profile
  busy: boolean
  onOpen: (open: boolean) => void
  onSaved: (group: Group) => void
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
  onError,
  onBusy,
}: {
  group: Group
  profile: Profile
  busy: boolean
  onSaved: (group: Group) => void
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
            onBusy(true)
            onError(null)
            try {
              onSaved(
                await recordPayment(group.id, {
                  date,
                  amount: parsed,
                  fromMemberId: fromId,
                  toMemberId: toId,
                  profileId: profile.id,
                })
              )
            } catch (err) {
              onError(errorText(err))
            } finally {
              onBusy(false)
            }
          }}
        >
          Save payment
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
