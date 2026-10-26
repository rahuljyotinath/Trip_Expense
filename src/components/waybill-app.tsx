"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Check,
  Link2,
  Pencil,
  Plus,
  Receipt,
  Trash2,
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
  commitGroupPatch,
  fetchGroup,
  fetchGroupByCode,
  fetchMyGroups,
  loadHealth,
  logoutUser,
  fetchSessionProfile,
  logInUser,
  signUpUser,
  openTrip,
  type Health,
} from "@/lib/client-api"
import { todayIsoDate } from "@/lib/ids"
import { formatMoney, parseAmount } from "@/lib/money"
import { suggestedMember } from "@/lib/operations"
import { netBalances, simplifyDebts } from "@/lib/settle"
import { parseJoinInput } from "@/lib/join"
import { tripStats } from "@/lib/stats"
import type { Expense, Group, PublicProfile } from "@/lib/types"

type Screen = "boot" | "auth" | "home" | "create" | "join" | "trip"
type AuthMode = "login" | "signup"

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
  body: Record<string, unknown>
  onGroup: (next: Group) => void
  onError: (message: string | null) => void
  onBusy: (busy: boolean) => void
  onDone?: () => void
  refresh?: () => Promise<void>
}) {
  const { group, body, onGroup, onError, onBusy, onDone, refresh } = input
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
      void refresh?.()
    },
    fetchLatest: () => fetchGroup(group.id),
  })
}

export function WaybillApp() {
  const searchParams = useSearchParams()
  const joinFromUrl = (searchParams.get("join") ?? "").toUpperCase()

  const [screen, setScreen] = useState<Screen>("boot")
  const [health, setHealth] = useState<Health | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [group, setGroup] = useState<Group | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [authMode, setAuthMode] = useState<AuthMode>("login")
  const [authUsername, setAuthUsername] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authDisplayName, setAuthDisplayName] = useState("")
  const [tripName, setTripName] = useState("")
  const [currency, setCurrency] = useState("INR")
  const [tripStartDate, setTripStartDate] = useState("")
  const [tripEndDate, setTripEndDate] = useState("")
  const [people, setPeople] = useState<string[]>([])
  const [personDraft, setPersonDraft] = useState("")
  const [code, setCode] = useState(joinFromUrl)
  const [joinGroup, setJoinGroup] = useState<Group | null>(null)

  const [expenseOpen, setExpenseOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function refreshGroups(nextProfile: PublicProfile) {
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
        const session = await fetchSessionProfile()
        if (!session?.username) {
          setScreen("auth")
          return
        }
        if (cancelled) return
        setProfile(session)
        await refreshGroups(session)
        if (joinFromUrl) {
          setCode(joinFromUrl)
          setScreen("join")
          return
        }
        setScreen("home")
      } catch (err) {
        if (!cancelled) {
          setError(errorText(err))
          setScreen("auth")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [joinFromUrl])

  async function onAuthSubmit() {
    setBusy(true)
    setError(null)
    try {
      const next =
        authMode === "signup"
          ? await signUpUser({
              username: authUsername,
              password: authPassword,
              name: authDisplayName.trim() || undefined,
            })
          : await logInUser({
              username: authUsername,
              password: authPassword,
            })
      setProfile(next)
      setAuthPassword("")
      await refreshGroups(next)
      setScreen(joinFromUrl || code ? "join" : "home")
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setBusy(true)
    setError(null)
    try {
      await logoutUser()
      setProfile(null)
      setGroup(null)
      setGroups([])
      setScreen("auth")
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
      setGroup(next)
      await refreshGroups(profile)
      setScreen("trip")
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
      onLogout={profile ? onLogout : undefined}
      onHome={
        screen === "trip"
          ? () => {
              setScreen("home")
              setGroup(null)
              setError(null)
            }
          : undefined
      }
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>Hold on</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {screen === "auth" ? (
        <AuthGate
          mode={authMode}
          username={authUsername}
          password={authPassword}
          displayName={authDisplayName}
          busy={busy}
          onMode={setAuthMode}
          onUsername={setAuthUsername}
          onPassword={setAuthPassword}
          onDisplayName={setAuthDisplayName}
          onSubmit={onAuthSubmit}
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
  onLogout,
}: {
  children: React.ReactNode
  health: Health | null
  profile: PublicProfile | null
  onHome?: () => void
  onLogout?: () => void
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
          <h1 className="font-heading text-4xl tracking-tight sm:text-5xl sm:text-[2.75rem]">
            Trip Expenses Balancer
          </h1>
        </button>
        <div className="text-right text-sm">
          {profile ? (
            <>
              <p className="font-medium">{profile.name}</p>
              <p className="text-xs text-muted-foreground">@{profile.username}</p>
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

function AuthGate({
  mode,
  username,
  password,
  displayName,
  busy,
  onMode,
  onUsername,
  onPassword,
  onDisplayName,
  onSubmit,
}: {
  mode: AuthMode
  username: string
  password: string
  displayName: string
  busy: boolean
  onMode: (value: AuthMode) => void
  onUsername: (value: string) => void
  onPassword: (value: string) => void
  onDisplayName: (value: string) => void
  onSubmit: () => void
}) {
  const canSubmit =
    username.trim().length > 0 && password.length >= 5

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="font-heading text-3xl">
          {mode === "login" ? "Sign in" : "Create account"}
        </CardTitle>
        <CardDescription>
          Username and password only — no email or SMS required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "login" ? "default" : "outline"}
            onClick={() => onMode("login")}
          >
            Sign in
          </Button>
          <Button
            type="button"
            variant={mode === "signup" ? "default" : "outline"}
            onClick={() => onMode("signup")}
          >
            Sign up
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-username">Username</Label>
          <Input
            id="auth-username"
            autoFocus
            value={username}
            autoComplete="username"
            placeholder="priya_k"
            onChange={(event) => onUsername(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            id="auth-password"
            type="password"
            value={password}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            onChange={(event) => onPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSubmit) onSubmit()
            }}
          />
          <p className="text-xs text-muted-foreground">At least 5 characters.</p>
        </div>
        {mode === "signup" ? (
          <div className="space-y-2">
            <Label htmlFor="auth-display">Display name (optional)</Label>
            <Input
              id="auth-display"
              value={displayName}
              placeholder="Priya Sharma"
              onChange={(event) => onDisplayName(event.target.value)}
            />
          </div>
        ) : null}
        <Button disabled={busy || !canSubmit} onClick={onSubmit} size="lg">
          {mode === "login" ? "Sign in" : "Create account"} <ArrowRight />
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
          Open a trip
        </Button>
        <Button size="lg" variant="outline" onClick={onJoin}>
          Join with a link
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
            placeholder="https://…/?join=…"
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
    <div className="rounded-xl border bg-card/50 px-4 py-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Trip spend
          </p>
          <p className="font-heading text-xl">{formatMoney(stats.totalSpend, group.currency)}</p>
        </div>
        {seatId && mine ? (
          <>
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Your share
              </p>
              <p className="font-heading text-xl">
                {formatMoney(mine.share, group.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                You paid
              </p>
              <p className="font-heading text-xl">
                {formatMoney(mine.paid, group.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                {balance.label}
              </p>
              <p className={`font-heading text-xl ${balance.className}`}>{balance.text}</p>
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
  profile: PublicProfile
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
  const isOpener = group.createdByProfileId === profile.id
  const balances = useMemo(() => netBalances(group), [group])
  const transfers = useMemo(() => simplifyDebts(group), [group])
  const ledgerExpenses = useMemo(
    () =>
      group.expenses
        .filter((item) => !item.voidedAt)
        .sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date)
          return b.createdAt.localeCompare(a.createdAt)
        }),
    [group.expenses]
  )
  const tripDates = formatTripDates(group)
  const [tripEditOpen, setTripEditOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<Expense | null>(null)
  const shareUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/?join=${group.code}`

  useEffect(() => {
    document.title = `${group.name} — Trip Expenses Balancer`
    return () => {
      document.title = "Trip Expenses Balancer"
    }
  }, [group.name])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
            Trip
          </p>
          <h2 className="font-heading text-4xl">{group.name}</h2>
          {tripDates ? (
            <p className="mt-1 text-sm text-muted-foreground">{tripDates}</p>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">
            {seat
              ? `On the roster as ${seat.name}.`
              : "You can look, but claim a name before logging spends."}
          </p>
          {isOpener ? (
            <Button
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => setTripEditOpen(true)}
            >
              Edit trip details
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button
            variant="outline"
            onClick={() => onPaymentOpen(true)}
            disabled={!seat}
          >
            <Banknote /> Paid back
          </Button>
          <Button
            onClick={() => {
              setEditingExpense(null)
              onExpenseOpen(true)
            }}
            disabled={!seat}
          >
            <Receipt /> Add spend
          </Button>
        </div>
      </div>

      <TripSummaryStrip group={group} seatId={seat?.id ?? null} />

      <Tabs defaultValue="ledger">
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
                    ? "No spends yet. Log the first one from the ledger tab."
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
                        onClick={() => {
                          applyGroupPatchOptimistic({
                            group,
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
                        onClick={() => {
                          applyGroupPatchOptimistic({
                            group,
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
          {ledgerExpenses.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Blank page</CardTitle>
                <CardDescription>
                  Date, amount, reason, who is on the bill. Split equally among
                  everyone you check.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            ledgerExpenses.map((expense) => {
              const canEdit =
                expense.createdByProfileId === profile.id ||
                group.createdByProfileId === profile.id
              return (
                <div
                  key={expense.id}
                  className="flex flex-col gap-2 rounded-lg border px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium leading-snug">{expense.reason}</p>
                      <p className="font-heading shrink-0 text-xl sm:hidden">
                        {formatMoney(expense.amount, group.currency)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDay(expense.date)} · Paid by{" "}
                      {memberName(group, expense.paidByMemberId)} · Split:{" "}
                      {expense.participantIds.map((id) => memberName(group, id)).join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
                    <p className="hidden font-heading text-2xl sm:block">
                      {formatMoney(expense.amount, group.currency)}
                    </p>
                    {canEdit ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setEditingExpense(expense)
                            onExpenseOpen(true)
                          }}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => setDeleteExpenseTarget(expense)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
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
                if (!deleteExpenseTarget) return
                const expenseId = deleteExpenseTarget.id
                applyGroupPatchOptimistic({
                  group,
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
      <ExpenseDialog
        open={expenseOpen}
        expense={editingExpense}
        group={group}
        profile={profile}
        busy={busy}
        onOpen={(open) => {
          onExpenseOpen(open)
          if (!open) setEditingExpense(null)
        }}
        onSaved={() => {
          onExpenseOpen(false)
          setEditingExpense(null)
        }}
        onGroup={onGroup}
        onRefresh={onRefresh}
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
          key={expense?.id ?? "new"}
          expense={expense}
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
  busy: boolean
  onSaved: () => void
  onGroup: (group: Group) => void
  onRefresh: () => Promise<void>
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  const seat = mySeat(group, profile.id)
  const isEdit = Boolean(expense)
  const [date, setDate] = useState(expense?.date ?? todayIsoDate())
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
  busy,
  onOpen,
  onSaved,
  onRefresh,
  onError,
  onBusy,
}: {
  open: boolean
  group: Group
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
  busy,
  onSaved,
  onRefresh,
  onError,
  onBusy,
}: {
  group: Group
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
