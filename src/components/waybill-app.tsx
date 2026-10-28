"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { BrandMark } from "@/components/brand-mark"
import { ProfileLink } from "@/components/profile/profile-link"
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle,
  Banknote,
  Check,
  ChevronLeft,
  ChevronDown,
  Compass,
  Download,
  KeyRound,
  Link2,
  Sparkles,
  Upload,
  Users,
  GripVertical,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Trash2,
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
import { formatTripDates } from "@/components/trip/trip-format"
import {
  TripPageChrome,
  type TripTabId,
} from "@/components/trip/trip-page-chrome"
import {
  LedgerExpenseHeadline,
  LedgerPaidBackHeadline,
  SettlePaidBackLine,
} from "@/components/trip/ledger-transaction-rows"
import { tripTabPanelClass } from "@/components/trip/trip-desk-layout"
import { Textarea } from "@/components/ui/textarea"
import {
  claimSeat,
  commitGroupPatch,
  drainGroupOutbox,
  fetchGroupByCode,
  fetchPendingTripInvites,
  respondTripInvite,
  fetchKnownContacts,
  addKnownContact,
  removeKnownContact,
  previewProfileForContactQuery,
  type KnownContact,
  fetchMyGroups,
  loadHealth,
  logoutUser,
  fetchSessionProfile,
  openTrip,
  outboxPendingCount,
  subscribeOutbox,
  clearSavedProfile,
  syncProfileToLocalStore,
  type Health,
} from "@/lib/client-api"
import { usernameForMemberProfile } from "@/lib/linked-trip-profiles"
import type { LinkedTripProfile } from "@/lib/types"
import {
  expenseRowMetaParts,
  expenseViewerSecondAmount,
  ledgerDayItems,
  ledgerDaysForViewer,
  ledgerPersonalExpensesForViewer,
  paymentViewerTone,
} from "@/lib/ledger-display"
import { todayIsoDate } from "@/lib/ids"
import { formatMoney, parseAmount } from "@/lib/money"
import { suggestedMember } from "@/lib/operations"
import { isTripAdmin } from "@/lib/trip-invites"
import { settlementBalances, simplifyDebts } from "@/lib/settle"
import { parseJoinInput } from "@/lib/join"
import { tripStats } from "@/lib/stats"
import { downloadTripCsvFile, parseTripCsv } from "@/lib/trip-csv"
import { profileNeedsSetup } from "@/lib/auth-ops"
import { applyGroupPatchOptimistic } from "@/lib/group-patch-optimistic"
import type { Expense, Group, JoinRequest, Payment, PublicProfile } from "@/lib/types"

export { formatTripDates } from "@/components/trip/trip-format"
export { applyGroupPatchOptimistic } from "@/lib/group-patch-optimistic"

const ExpenseDialog = dynamic(
  () =>
    import("@/components/trip/trip-expense-payment-dialogs").then((m) => ({
      default: m.ExpenseDialog,
    })),
  { ssr: false }
)
const PaymentDialog = dynamic(
  () =>
    import("@/components/trip/trip-expense-payment-dialogs").then((m) => ({
      default: m.PaymentDialog,
    })),
  { ssr: false }
)

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

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "That failed."
}

export function WaybillApp() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const joinFromUrl = (searchParams.get("join") ?? "").toUpperCase()
  const tripFromUrl = (searchParams.get("trip") ?? "").trim()

  const [screen, setScreen] = useState<Screen>("boot")
  const [health, setHealth] = useState<Health | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [groups, setGroups] = useState<Group[] | null>(null)
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
  const [joinRequest, setJoinRequest] = useState<JoinRequest | null>(null)
  const [pendingInvites, setPendingInvites] = useState<
    Awaited<ReturnType<typeof fetchPendingTripInvites>>
  >([])
  const [knownContacts, setKnownContacts] = useState<KnownContact[]>([])

  async function refreshGroups(nextProfile: PublicProfile) {
    const list = await fetchMyGroups(nextProfile.id)
    setGroups(list)
    return list
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
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
          if (!session?.id) {
            router.replace(
              `/login?join=${encodeURIComponent(joinFromUrl)}&next=${encodeURIComponent(`/?join=${encodeURIComponent(joinFromUrl)}`)}`
            )
            return
          }
          try {
            const invited = await fetchGroupByCode(joinFromUrl)
            router.replace(
              `/trip/${invited.group.id}?join=${encodeURIComponent(joinFromUrl)}`
            )
          } catch {
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
        setScreen("home")
        try {
          const [list, invites, contacts] = await Promise.all([
            fetchMyGroups(session.id),
            fetchPendingTripInvites().catch(() => [] as Awaited<
              ReturnType<typeof fetchPendingTripInvites>
            >),
            fetchKnownContacts().catch(() => [] as KnownContact[]),
          ])
          if (cancelled) return
          setGroups(list)
          setPendingInvites(invites)
          setKnownContacts(contacts)
        } catch (err) {
          if (!cancelled) {
            setGroups([])
            setPendingInvites([])
            setKnownContacts([])
            setError(errorText(err))
          }
        }
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
      setGroups(null)
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
      const lookup = await fetchGroupByCode(parseJoinInput(code))
      setJoinGroup(lookup.group)
      setJoinRequest(lookup.joinRequest)
    } catch (err) {
      setJoinGroup(null)
      setJoinRequest(null)
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
          pendingInvites={pendingInvites}
          knownContacts={knownContacts}
          onAddContact={async (query) => {
            setBusy(true)
            setError(null)
            try {
              setKnownContacts(await addKnownContact({ query }))
            } catch (err) {
              setError(errorText(err))
            } finally {
              setBusy(false)
            }
          }}
          onRemoveContact={async (targetProfileId) => {
            setBusy(true)
            setError(null)
            try {
              setKnownContacts(await removeKnownContact(targetProfileId))
            } catch (err) {
              setError(errorText(err))
            } finally {
              setBusy(false)
            }
          }}
          onInviteAccept={async (inviteId) => {
            if (!profile) return
            setBusy(true)
            setError(null)
            try {
              const group = await respondTripInvite("accept", inviteId)
              setPendingInvites(await fetchPendingTripInvites())
              if (group) {
                const lookup = await fetchGroupByCode(group.code)
                setJoinGroup(lookup.group)
                setJoinRequest(lookup.joinRequest)
                setCode(group.code)
                setScreen("join")
              }
            } catch (err) {
              setError(errorText(err))
            } finally {
              setBusy(false)
            }
          }}
          onInviteDecline={async (inviteId) => {
            setBusy(true)
            try {
              await respondTripInvite("decline", inviteId)
              setPendingInvites(await fetchPendingTripInvites())
            } catch (err) {
              setError(errorText(err))
            } finally {
              setBusy(false)
            }
          }}
          onCreate={() => {
            setError(null)
            setPeople(profile.name ? [profile.name] : [])
            setScreen("create")
          }}
          onJoin={() => {
            setError(null)
            setJoinGroup(null)
            setJoinRequest(null)
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
          joinRequest={joinRequest}
          busy={busy}
          onCode={setCode}
          onLookup={onLookupCode}
          onRequestJoin={() => {
            if (!joinGroup) return
            setBusy(true)
            setError(null)
            commitGroupPatch(
              joinGroup,
              {
                action: "request-join",
                code: parseJoinInput(code),
                profileId: profile.id,
              },
              {
                onApplied: async (next) => {
                  setJoinGroup(next)
                  try {
                    const lookup = await fetchGroupByCode(parseJoinInput(code))
                    setJoinRequest(lookup.joinRequest)
                  } catch {
                    /* keep optimistic */
                  }
                  setBusy(false)
                },
                onError: (message) => {
                  setError(message)
                  setBusy(false)
                },
              },
              profile
            )
          }}
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
          ? "relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 sm:px-5 lg:py-5"
          : "relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10"
      }
    >
      {!compact ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 hero-glow" aria-hidden />
      ) : null}
      <header
        className={
          compact
            ? "sticky top-0 z-30 -mx-4 mb-2 flex shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 pb-2 backdrop-blur-md sm:-mx-5 sm:px-5 lg:relative lg:mx-0 lg:mb-3 lg:bg-transparent lg:px-0 lg:backdrop-blur-none"
            : "relative mb-8 flex items-start justify-between gap-4"
        }
      >
        <div className="flex min-h-10 min-w-0 flex-1 items-center gap-0.5">
          {compact && onHome ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 lg:hidden"
              onClick={onHome}
              aria-label="Back"
            >
              <ChevronLeft />
            </Button>
          ) : null}
          {compact ? (
            <BrandMark
              size="sm"
              onClick={onHome}
              className={onHome ? undefined : "pointer-events-none opacity-100"}
            />
          ) : (
            <div className="min-w-0">
              <BrandMark size="md" onClick={onHome} />
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Free trip khata for India — WhatsApp pe link bhejo, bill split karo, settle clear.
                Friends ke liye hamesha free.
              </p>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right text-sm">
          {profile ? (
            <>
              <p className="max-w-[7rem] truncate font-medium sm:max-w-none">{profile.name}</p>
              <p className="hidden text-xs text-muted-foreground sm:block">@{profile.username}</p>
              <div className="hidden gap-2 sm:flex sm:items-center sm:justify-end">
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
              </div>
              <Link
                href="/profile/setup"
                className="text-[11px] text-muted-foreground underline underline-offset-4 sm:hidden"
              >
                Profile
              </Link>
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
      <main
        className={compact ? "flex flex-1 flex-col" : "flex-1"}
      >
        {children}
      </main>
    </div>
  )
}

function Home({
  profile,
  groups,
  busy,
  pendingInvites,
  knownContacts,
  onAddContact,
  onRemoveContact,
  onInviteAccept,
  onInviteDecline,
  onCreate,
  onJoin,
  onOpen,
}: {
  profile: PublicProfile
  groups: Group[] | null
  busy: boolean
  pendingInvites: Awaited<ReturnType<typeof fetchPendingTripInvites>>
  knownContacts: KnownContact[]
  onAddContact: (query: string) => void
  onRemoveContact: (targetProfileId: string) => void
  onInviteAccept: (inviteId: string) => void
  onInviteDecline: (inviteId: string) => void
  onCreate: () => void
  onJoin: () => void
  onOpen: (id: string) => void
}) {
  const [contactQuery, setContactQuery] = useState("")
  const [contactPreview, setContactPreview] = useState<
    Awaited<ReturnType<typeof previewProfileForContactQuery>>
  >(null)
  useEffect(() => {
    const q = contactQuery.trim()
    if (!q) {
      setContactPreview(null)
      return
    }
    const timer = window.setTimeout(() => {
      void previewProfileForContactQuery(q)
        .then(setContactPreview)
        .catch(() => setContactPreview(null))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [contactQuery])
  return (
    <div className="space-y-6">
      {pendingInvites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Trip invites</CardTitle>
            <CardDescription>
              You were invited by email or phone. Accept to claim a seat on the roster.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="font-medium">{invite.tripName}</p>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onInviteAccept(invite.id)}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onInviteDecline(invite.id)}
                  >
                    Decline
                  </Button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <div>
        <h2 className="font-heading text-3xl">Hey {profile.name}.</h2>
        <p className="mt-1 max-w-xl text-muted-foreground">
          Opening a trip writes the roster. Joining means you claim one of those
          names. Nobody floats unattached.
        </p>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground/90">
          Goa, wedding, family yatra — trip khatam, hisaab clear. No app fee.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={onCreate}>
          <Compass className="size-4" />
          Open a trip
        </Button>
        <Button size="lg" variant="outline" onClick={onJoin}>
          <KeyRound className="size-4" />
          Join with a code
        </Button>
      </div>
      <Separator />
      <Card>
        <CardHeader>
          <CardTitle>Known contacts</CardTitle>
          <CardDescription>
            People you saved. Exact @username, email, or phone — not a public directory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="@username, email, or phone"
              value={contactQuery}
              disabled={busy}
              onChange={(event) => setContactQuery(event.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy || !contactQuery.trim()}
              onClick={() => {
                const q = contactQuery.trim()
                if (!q) return
                void onAddContact(q)
                setContactQuery("")
                setContactPreview(null)
              }}
            >
              Add contact
            </Button>
          </div>
          {contactPreview?.username ? (
            <p className="text-sm">
              Found{" "}
              <ProfileLink username={contactPreview.username}>
                {contactPreview.name} (@{contactPreview.username})
              </ProfileLink>
            </p>
          ) : null}
          {knownContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Shared trips with linked profiles appear here automatically.
            </p>
          ) : (
            <ul className="space-y-1">
              {knownContacts.map((contact) => (
                <li
                  key={contact.contactId}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span>
                    {contact.username ? (
                      <ProfileLink username={contact.username}>
                        {contact.name}
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          @{contact.username}
                        </span>
                      </ProfileLink>
                    ) : (
                      <span className="font-medium">{contact.name}</span>
                    )}
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onRemoveContact(contact.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Separator />
      {groups === null ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="ledger-loader" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <p className="text-sm text-muted-foreground">Loading your trips…</p>
        </div>
      ) : groups.length === 0 ? (
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
          Open one and list every person who will spend. Or ask for the trip
          join code from whoever already did.
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
  joinRequest,
  busy,
  onCode,
  onLookup,
  onRequestJoin,
  onClaim,
  onBack,
}: {
  profile: PublicProfile
  code: string
  group: Group | null
  joinRequest: JoinRequest | null
  busy: boolean
  onCode: (value: string) => void
  onLookup: () => void
  onRequestJoin: () => void
  onClaim: (memberId: string) => void
  onBack: () => void
}) {
  const suggestion = group ? suggestedMember(group, profile.name) : null
  const alreadySeated =
    group?.members.some((member) => member.profileId === profile.id) ?? false
  const needsApproval = Boolean(group?.joinApprovalRequired)
  const canClaim =
    group &&
    !alreadySeated &&
    (!needsApproval || joinRequest?.status === "approved")
  const showRequest =
    group &&
    !alreadySeated &&
    needsApproval &&
    (!joinRequest || joinRequest.status === "rejected")

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="font-heading text-3xl">Join a trip</CardTitle>
        <CardDescription>
          Enter the join code from the trip header (six letters). Then claim the
          nickname that is you on the roster.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={code}
            placeholder="ABCDEF"
            className="font-mono uppercase tracking-widest"
            autoComplete="off"
            spellCheck={false}
            maxLength={32}
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
              {alreadySeated ? (
                <p className="text-sm text-muted-foreground">
                  You already have a seat on this trip.
                </p>
              ) : joinRequest?.status === "pending" ? (
                <p className="text-sm text-muted-foreground">
                  Waiting for the trip admin to approve your join request.
                </p>
              ) : joinRequest?.status === "rejected" ? (
                <p className="text-sm text-stamp">
                  Your join request was declined. You can request again.
                </p>
              ) : needsApproval && joinRequest?.status !== "approved" ? (
                <p className="text-sm text-muted-foreground">
                  This trip requires admin approval before you claim a nickname.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Claim one open nickname. Occupied seats stay taken.
                </p>
              )}
            </div>
            {showRequest ? (
              <Button disabled={busy} onClick={onRequestJoin}>
                Request to join
              </Button>
            ) : null}
            {canClaim ? (
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
            ) : null}
          </div>
        ) : null}
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </CardContent>
    </Card>
  )
}

function reorderDayItemIds(ids: string[], dragId: string, targetId: string) {
  const from = ids.indexOf(dragId)
  const to = ids.indexOf(targetId)
  if (from < 0 || to < 0 || from === to) return ids
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, dragId)
  return next
}

export function TripDesk({
  profile,
  group,
  tripPath,
  busy,
  copied,
  expenseOpen,
  paymentOpen,
  onExpenseOpen,
  onPaymentOpen,
  onCopy,
  onRefresh,
  onGroup,
  onError,
  onBusy,
  onClaim,
  fromCache = false,
  linkedProfiles = [],
}: {
  profile: PublicProfile | null
  group: Group
  tripPath: string
  busy: boolean
  copied: boolean
  expenseOpen: boolean
  paymentOpen: boolean
  onExpenseOpen: (open: boolean) => void
  onPaymentOpen: (open: boolean) => void
  onCopy: (value: string) => void
  onRefresh: () => Promise<void>
  onGroup: (group: Group) => void
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
  onClaim?: (memberId: string) => void
  fromCache?: boolean
  linkedProfiles?: LinkedTripProfile[]
}) {
  const seat = profile ? mySeat(group, profile.id) : null
  const isAdmin = profile ? isTripAdmin(group, profile.id) : false
  const canWrite = Boolean(profile && seat)
  const claimSuggestion = profile && !seat ? suggestedMember(group, profile.name) : null
  const balances = useMemo(() => settlementBalances(group), [group])
  const transfers = useMemo(() => simplifyDebts(group), [group])
  const personalLedgerExpenses = useMemo(
    () => ledgerPersonalExpensesForViewer(group, seat?.id ?? null),
    [group, seat?.id]
  )
  const ledgerDays = useMemo(
    () => ledgerDaysForViewer(group, seat?.id ?? null),
    [group, seat?.id]
  )
  const memberIds = useMemo(() => group.members.map((member) => member.id), [group.members])
  const viewerMemberId = seat?.id ?? null
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [draftExpenseDate, setDraftExpenseDate] = useState<string | null>(null)
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<Expense | null>(null)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [dragRowId, setDragRowId] = useState<string | null>(null)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(() => new Set())
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const deskTab: TripTabId =
    tabParam === "settle" || tabParam === "people" ? tabParam : "ledger"
  function tabHref(tab: "settle" | "ledger" | "people") {
    return tab === "ledger" ? tripPath : `${tripPath}?tab=${tab}`
  }

  function toggleDayCollapsed(date: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function collapseAllLedgerDays() {
    setCollapsedDays(new Set(ledgerDays.map((day) => day.date)))
  }

  function expandAllLedgerDays() {
    setCollapsedDays(new Set())
  }

  function openNewExpense(forDate?: string) {
    setEditingExpense(null)
    setDraftExpenseDate(forDate ?? null)
    onExpenseOpen(true)
  }
  const [importCsvText, setImportCsvText] = useState<string | null>(null)
  useEffect(() => {
    document.title = `${group.name} — Tripzy`
    return () => {
      document.title = "Tripzy"
    }
  }, [group.name])

  useEffect(() => {
    function scrollToLedgerHash() {
      const hash = typeof window !== "undefined" ? window.location.hash : ""
      if (!hash.startsWith("#ledger-day-")) return
      const el = document.querySelector(hash)
      if (el instanceof HTMLElement) {
        window.requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" })
        })
      }
    }
    scrollToLedgerHash()
    window.addEventListener("hashchange", scrollToLedgerHash)
    return () => window.removeEventListener("hashchange", scrollToLedgerHash)
  }, [group.id])

  return (
    <div className="flex flex-1 flex-col">
      <TripPageChrome
        group={group}
        profile={profile}
        tripPath={tripPath}
        seatId={seat?.id ?? null}
        isTripAdmin={isAdmin}
        canWrite={canWrite}
        busy={busy}
        copied={copied}
        fromCache={fromCache}
        activeTab={deskTab}
        tabHref={tabHref}
        onCopy={onCopy}
        onImportCsvReady={setImportCsvText}
        onImportCsvError={onError}
        onPaymentOpen={() => {
          setEditingPayment(null)
          onPaymentOpen(true)
        }}
        onAddExpense={() => openNewExpense()}
      >
      <Tabs value={deskTab} className="flex flex-col gap-2">
        <TabsContent value="settle" className={tripTabPanelClass}>
          <div className="space-y-2">
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
                    <div className="flex flex-wrap items-center gap-2">
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
                  (payment.createdByProfileId === profile.id || isAdmin)
                return (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <SettlePaidBackLine
                      group={group}
                      payment={payment}
                      viewerMemberId={seat?.id ?? null}
                      dateLabel={formatDay(payment.date)}
                      crossed={crossed}
                    />
                    <p
                      className={`shrink-0 tabular-nums ${crossed ? "text-muted-foreground line-through" : ""}`}
                    >
                      {formatMoney(payment.amount, group.currency)}
                    </p>
                    {canEdit ? (
                      <span className="flex shrink-0 gap-0.5">
                        {!crossed ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={busy}
                            aria-label="Edit paid-back"
                            onClick={() => {
                              setEditingPayment(payment)
                              onPaymentOpen(true)
                            }}
                          >
                            <Pencil />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy}
                          aria-label={crossed ? "Restore paid-back" : "Delete paid-back"}
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
                          {crossed ? <RotateCcw /> : <Trash2 />}
                        </Button>
                      </span>
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
          </div>
        </TabsContent>
        <TabsContent value="ledger" className={tripTabPanelClass}>
          {ledgerDays.length >= 2 ? (
            <div className="mb-2 flex shrink-0 justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={collapseAllLedgerDays}
              >
                Collapse all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={expandAllLedgerDays}
              >
                Expand all
              </Button>
            </div>
          ) : null}
          <div className="space-y-4">
          {ledgerDays.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No group spends yet</CardTitle>
                <CardDescription>
                  Shared bills and your paid-back transfers appear here by day (oldest first).
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-4">
              {ledgerDays.map((day) => {
                const collapsed = collapsedDays.has(day.date)
                return (
                  <section
                    key={day.date}
                    id={`ledger-day-${day.date}`}
                    className="scroll-mt-16 overflow-hidden rounded-xl border bg-card/50"
                  >
                    <div className="sticky top-0 z-10 grid grid-cols-1 items-center gap-x-4 gap-y-2 border-b bg-card px-3 py-2.5 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2 text-left"
                        aria-expanded={!collapsed}
                        onClick={() => toggleDayCollapsed(day.date)}
                      >
                        <ChevronDown
                          className={`size-4 shrink-0 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
                        />
                        <h3 className="font-heading text-base">{formatDay(day.date)}</h3>
                      </button>
                      {canWrite ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          className="w-full sm:w-auto"
                          onClick={() => openNewExpense(day.date)}
                        >
                          <Receipt className="size-3.5" />
                          <span className="sm:hidden">Add</span>
                          <span className="hidden sm:inline">
                            Add expense for {formatDayDots(day.date)}
                          </span>
                        </Button>
                      ) : (
                        <span className="hidden sm:block" />
                      )}
                      <p className="font-heading text-base tabular-nums sm:min-w-[5.5rem] sm:text-right">
                        {formatMoney(day.groupSpendTotal, group.currency)}
                      </p>
                    </div>
                    {!collapsed ? (
                      <div className="divide-y divide-border/60">
                        {(() => {
                          const dayItems = ledgerDayItems(day, group.ledgerDayOrder)
                          function applyDayReorder(dragId: string, targetId: string) {
                            if (!profile || !canWrite) return
                            const ids = dayItems.map((row) =>
                              row.kind === "expense" ? row.expense.id : row.payment.id
                            )
                            applyGroupPatchOptimistic({
                              group,
                              profile,
                              body: {
                                action: "reorder-ledger-day",
                                date: day.date,
                                orderedIds: reorderDayItemIds(ids, dragId, targetId),
                                profileId: profile.id,
                              },
                              onGroup,
                              onError,
                              onBusy,
                              refresh: onRefresh,
                            })
                          }
                          function rowDragHandlers(rowId: string) {
                            return {
                              draggable: canWrite,
                              onDragStart: () => setDragRowId(rowId),
                              onDragEnd: () => setDragRowId(null),
                              onDragOver: (event: DragEvent) => {
                                event.preventDefault()
                              },
                              onDrop: (event: DragEvent) => {
                                event.preventDefault()
                                if (dragRowId && dragRowId !== rowId) {
                                  applyDayReorder(dragRowId, rowId)
                                }
                                setDragRowId(null)
                              },
                            }
                          }
                          return dayItems.map((item) => {
                          if (item.kind === "payment") {
                            const payment = item.payment
                            const canEditPayment =
                              profile &&
                              (payment.createdByProfileId === profile.id || isAdmin)
                            const tone = paymentViewerTone(payment, viewerMemberId)
                            return (
                              <div
                                key={payment.id}
                                {...rowDragHandlers(payment.id)}
                                className={
                                  canWrite
                                    ? "grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 px-3 py-1.5"
                                    : "grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 px-3 py-1.5"
                                }
                              >
                                {canWrite ? (
                                  <GripVertical
                                    className="size-3.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                                    aria-hidden
                                  />
                                ) : null}
                                <LedgerPaidBackHeadline
                                  group={group}
                                  payment={payment}
                                  viewerMemberId={viewerMemberId}
                                />
                                <p className="shrink-0 text-sm tabular-nums">
                                  {formatMoney(payment.amount, group.currency)}
                                </p>
                                {viewerMemberId ? (
                                  <p
                                    className={`w-[6.75rem] shrink-0 truncate text-right text-[11px] ${
                                      tone === "received"
                                        ? "text-moss"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {tone === "received"
                                      ? "You received"
                                      : tone === "paid-back"
                                        ? "You paid back"
                                        : "—"}
                                  </p>
                                ) : null}
                                {canEditPayment ? (
                                  <span className="flex shrink-0 gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      disabled={busy}
                                      aria-label="Edit paid-back"
                                      onClick={() => {
                                        setEditingPayment(payment)
                                        onPaymentOpen(true)
                                      }}
                                    >
                                      <Pencil />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      disabled={busy}
                                      aria-label="Delete paid-back"
                                      onClick={() => {
                                        applyGroupPatchOptimistic({
                                          group,
                                          profile,
                                          body: {
                                            action: "void-payment",
                                            paymentId: payment.id,
                                            profileId: profile.id,
                                            restore: false,
                                          },
                                          onGroup,
                                          onError,
                                          onBusy,
                                          refresh: onRefresh,
                                        })
                                      }}
                                    >
                                      <Trash2 />
                                    </Button>
                                  </span>
                                ) : null}
                              </div>
                            )
                          }
                          const expense = item.expense
                          const canEdit =
                            profile &&
                            (expense.createdByProfileId === profile.id || isAdmin)
                          const second = expenseViewerSecondAmount(
                            expense,
                            viewerMemberId,
                            memberIds
                          )
                          const rowMeta = expenseRowMetaParts(
                            group,
                            expense,
                            viewerMemberId
                          )
                          return (
                            <div
                              key={expense.id}
                              {...rowDragHandlers(expense.id)}
                              className={
                                canWrite
                                  ? "grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] grid-rows-[auto_auto] items-center gap-x-2 gap-y-0.5 px-3 py-1.5"
                                  : "grid grid-cols-[minmax(0,1fr)_auto_auto_auto] grid-rows-[auto_auto] items-center gap-x-2 gap-y-0.5 px-3 py-1.5"
                              }
                            >
                              {canWrite ? (
                                <GripVertical
                                  className="col-start-1 row-span-2 size-3.5 shrink-0 cursor-grab self-center text-muted-foreground active:cursor-grabbing"
                                  aria-hidden
                                />
                              ) : null}
                              <LedgerExpenseHeadline
                                reason={expense.reason}
                                rowMeta={rowMeta}
                                className={canWrite ? "col-start-2 row-start-1" : "col-start-1 row-start-1"}
                              />
                              <p
                                className={`truncate text-[11px] text-muted-foreground ${
                                  canWrite ? "col-start-2 row-start-2" : "col-start-1 row-start-2"
                                }`}
                              >
                                Shared by {rowMeta.sharedWith}
                              </p>
                              <p
                                className={`row-span-2 shrink-0 self-center text-right text-sm tabular-nums ${
                                  canWrite ? "col-start-3 row-start-1" : "col-start-2 row-start-1"
                                }`}
                              >
                                {formatMoney(expense.amount, group.currency)}
                              </p>
                              {viewerMemberId ? (
                                <p
                                  className={`row-span-2 w-[6.75rem] shrink-0 self-center truncate text-right text-[11px] tabular-nums ${
                                    canWrite ? "col-start-4 row-start-1" : "col-start-3 row-start-1"
                                  } ${
                                    second.kind === "lent"
                                      ? "text-moss"
                                      : second.kind === "owe"
                                        ? "text-stamp"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {second.kind === "lent"
                                    ? `You lent ${formatMoney(second.amount, group.currency)}`
                                    : second.kind === "owe"
                                      ? `You owe ${formatMoney(second.amount, group.currency)}`
                                      : "—"}
                                </p>
                              ) : null}
                                {canEdit ? (
                                  <span
                                    className={`row-span-2 flex shrink-0 gap-0.5 self-center ${
                                      canWrite
                                        ? viewerMemberId
                                          ? "col-start-5 row-start-1"
                                          : "col-start-4 row-start-1"
                                        : viewerMemberId
                                          ? "col-start-4 row-start-1"
                                          : "col-start-3 row-start-1"
                                    }`}
                                  >
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      disabled={busy}
                                      aria-label="Edit spend"
                                      onClick={() => {
                                        setEditingExpense(expense)
                                        onExpenseOpen(true)
                                      }}
                                    >
                                      <Pencil />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      disabled={busy}
                                      aria-label="Delete spend"
                                      onClick={() => setDeleteExpenseTarget(expense)}
                                    >
                                      <Trash2 />
                                    </Button>
                                  </span>
                                ) : null}
                            </div>
                          )
                        })
                        })()}
                      </div>
                    ) : null}
                  </section>
                )
              })}
            </div>
          )}
          {personalLedgerExpenses.length > 0 ? (
            <section className="space-y-2 border-t pt-4">
              <div>
                <h3 className="font-heading text-base">Your personal spends</h3>
                <p className="text-sm text-muted-foreground">
                  Solo spends only you see — not mixed into group splits.
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personalLedgerExpenses.map((expense) => (
                      <tr key={expense.id} className="border-b last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDay(expense.date)}</td>
                        <td className="px-3 py-2">{expense.reason}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(expense.amount, group.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
          </div>
        </TabsContent>
        <TabsContent value="people" className={tripTabPanelClass}>
          <div className="space-y-2">
          {group.members.map((member) => {
            const cover = member.coveredByMemberId
              ? group.members.find((item) => item.id === member.coveredByMemberId)
              : null
            const settlesFor = group.members.filter(
              (item) => item.coveredByMemberId === member.id
            )
            const balance = balances[member.id] ?? 0
            const memberUsername = usernameForMemberProfile(
              linkedProfiles,
              member.profileId
            )
            const nameLine = (
              <>
                {member.name}
                {profile && member.profileId === profile.id ? " · you" : ""}
              </>
            )
            return (
              <div
                key={member.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {memberUsername ? (
                      <ProfileLink username={memberUsername}>{nameLine}</ProfileLink>
                    ) : (
                      nameLine
                    )}
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
          </div>
        </TabsContent>
      </Tabs>
      </TripPageChrome>

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
              entry on this trip. Join code stays the same.
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
          <PaymentDialog
            open={paymentOpen}
            group={group}
            profile={profile}
            busy={busy}
            editingPayment={editingPayment}
            onOpen={(open) => {
              onPaymentOpen(open)
              if (!open) setEditingPayment(null)
            }}
            onSaved={(next) => {
              onGroup(next)
              onPaymentOpen(false)
              setEditingPayment(null)
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
