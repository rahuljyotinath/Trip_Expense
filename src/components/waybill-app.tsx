"use client"

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
  fetchFriends,
  addFriend,
  removeFriend,
  previewProfileForContactQuery,
  type Friend,
  fetchMyGroups,
  persistGroupSnapshots,
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
import type { Group, JoinRequest, PublicProfile } from "@/lib/types"
import { Shell } from "@/components/trip/trip-shell"

export { formatTripDates } from "@/components/trip/trip-format"
export { applyGroupPatchOptimistic } from "@/lib/group-patch-optimistic"
export { Shell } from "@/components/trip/trip-shell"
export { TripDesk } from "@/components/trip/trip-desk"

type Screen = "boot" | "home" | "create" | "join"
type CreateKind = "trip" | "group"

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
  const [friends, setFriends] = useState<Friend[]>([])
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([])
  const [createKind, setCreateKind] = useState<CreateKind>("trip")

  async function refreshGroups(nextProfile: PublicProfile) {
    const list = await fetchMyGroups(nextProfile.id)
    persistGroupSnapshots(list)
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
            fetchFriends().catch(() => [] as Friend[]),
          ])
          if (cancelled) return
          persistGroupSnapshots(list)
          setGroups(list)
          setPendingInvites(invites)
          setFriends(contacts)
        } catch (err) {
          if (!cancelled) {
            setGroups([])
            setPendingInvites([])
            setFriends([])
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
    const names = rosterNames()
    const manualOthers = names.filter(
      (item) => item.toLowerCase() !== profile.name.toLowerCase()
    )
    const friendRows = friends
      .filter((item) => selectedFriendIds.includes(item.id))
      .map((item) => ({ name: item.name, profileId: item.id }))
    const friendNameKeys = new Set(
      friendRows.map((item) => item.name.toLowerCase())
    )
    const manualRows = manualOthers
      .filter((item) => !friendNameKeys.has(item.toLowerCase()))
      .map((name) => ({ name }))
    const roster = [...friendRows, ...manualRows]
    if (roster.length < 1) {
      setError("Add at least one friend or nickname, then write the roster.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await openTrip({
        name: tripName,
        roster,
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
      setSelectedFriendIds([])
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
          friends={friends}
          onAddFriend={async (query) => {
            setBusy(true)
            setError(null)
            try {
              setFriends(await addFriend({ query }))
            } catch (err) {
              setError(errorText(err))
            } finally {
              setBusy(false)
            }
          }}
          onRemoveFriend={async (targetProfileId) => {
            setBusy(true)
            setError(null)
            try {
              setFriends(await removeFriend(targetProfileId))
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
            setSelectedFriendIds([])
            setCreateKind("trip")
            setScreen("create")
          }}
          onCreateGroup={() => {
            setError(null)
            setPeople(profile.name ? [profile.name] : [])
            setSelectedFriendIds([])
            setCreateKind("group")
            setTripStartDate("")
            setTripEndDate("")
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
          createKind={createKind}
          onCreateKind={(kind) => {
            setCreateKind(kind)
            if (kind === "group") {
              setTripStartDate("")
              setTripEndDate("")
            }
          }}
          tripName={tripName}
          currency={currency}
          startDate={tripStartDate}
          endDate={tripEndDate}
          people={people}
          personDraft={personDraft}
          friends={friends}
          selectedFriendIds={selectedFriendIds}
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
          onToggleFriend={(friendId) => {
            setSelectedFriendIds((current) =>
              current.includes(friendId)
                ? current.filter((id) => id !== friendId)
                : [...current, friendId]
            )
          }}
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


function Home({
  profile,
  groups,
  busy,
  pendingInvites,
  friends,
  onAddFriend,
  onRemoveFriend,
  onInviteAccept,
  onInviteDecline,
  onCreate,
  onCreateGroup,
  onJoin,
  onOpen,
}: {
  profile: PublicProfile
  groups: Group[] | null
  busy: boolean
  pendingInvites: Awaited<ReturnType<typeof fetchPendingTripInvites>>
  friends: Friend[]
  onAddFriend: (query: string) => void
  onRemoveFriend: (targetProfileId: string) => void
  onInviteAccept: (inviteId: string) => void
  onInviteDecline: (inviteId: string) => void
  onCreate: () => void
  onCreateGroup: () => void
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
          Goa, wedding, flat lunch club — hisaab clear. No app fee.{" "}
          <Link href="/vs-splitwise" className="underline underline-offset-4">
            vs Splitwise
          </Link>
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button size="lg" onClick={onCreate}>
          <Compass className="size-4" />
          Open a trip
        </Button>
        <Button size="lg" variant="secondary" onClick={onCreateGroup}>
          <Users className="size-4" />
          Ongoing group
        </Button>
        <Button size="lg" variant="outline" onClick={onJoin}>
          <KeyRound className="size-4" />
          Join with a code
        </Button>
      </div>
      <Separator />
      <Card>
        <CardHeader>
          <CardTitle>Friends</CardTitle>
          <CardDescription>
            Add by @username — one-way, no accept needed. Trip mates also show up here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="@username"
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
                void onAddFriend(q)
                setContactQuery("")
                setContactPreview(null)
              }}
            >
              Add friend
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
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add friends by username, or share a trip — linked profiles appear here too.
            </p>
          ) : (
            <ul className="space-y-1">
              {friends.map((contact) => (
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
                    onClick={() => onRemoveFriend(contact.id)}
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
      <nav className="flex flex-wrap gap-x-4 gap-y-1 pt-4 text-xs text-muted-foreground">
        <Link href="/for-operators" className="underline underline-offset-4">
          For operators
        </Link>
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy
        </Link>
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>
      </nav>
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
  createKind,
  onCreateKind,
  tripName,
  currency,
  startDate,
  endDate,
  people,
  personDraft,
  friends,
  selectedFriendIds,
  busy,
  onTripName,
  onCurrency,
  onStartDate,
  onEndDate,
  onDraft,
  onAddPerson,
  onRemovePerson,
  onToggleFriend,
  onBack,
  onSubmit,
}: {
  profile: PublicProfile
  createKind: CreateKind
  onCreateKind: (kind: CreateKind) => void
  tripName: string
  currency: string
  startDate: string
  endDate: string
  people: string[]
  personDraft: string
  friends: Friend[]
  selectedFriendIds: string[]
  busy: boolean
  onTripName: (value: string) => void
  onCurrency: (value: string) => void
  onStartDate: (value: string) => void
  onEndDate: (value: string) => void
  onDraft: (value: string) => void
  onAddPerson: () => void
  onRemovePerson: (value: string) => void
  onToggleFriend: (friendId: string) => void
  onBack: () => void
  onSubmit: () => void
}) {
  const manualOthers = people.filter(
    (item) => item.toLowerCase() !== profile.name.toLowerCase()
  ).length
  const draftExtra =
    personDraft.trim() &&
    !people.some(
      (item) => item.toLowerCase() === personDraft.trim().toLowerCase()
    )
      ? 1
      : 0
  const rosterOthers = selectedFriendIds.length + manualOthers + draftExtra
  const canWrite = Boolean(tripName.trim()) && rosterOthers >= 1

  const isGroup = createKind === "group"

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="font-heading text-3xl">
          {isGroup ? "Name the group." : "Name the trip."}
        </CardTitle>
        <CardDescription>
          {isGroup
            ? "Flatmates, office lunch crew, standing IOUs — no end date. Same roster and settle as a trip."
            : "Be specific. “Goa Diwali 2026” settles. “Goa” fights with the next Goa. Nicknames on the roster — two Rahuls? Call one Rahul K."}
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={createKind === "trip" ? "default" : "outline"}
            onClick={() => onCreateKind("trip")}
          >
            Trip
          </Button>
          <Button
            type="button"
            size="sm"
            variant={createKind === "group" ? "default" : "outline"}
            onClick={() => onCreateKind("group")}
          >
            Ongoing group
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="trip-name">{isGroup ? "Group" : "Trip"}</Label>
          <Input
            id="trip-name"
            value={tripName}
            placeholder={isGroup ? "Flat 402 / Office lunch" : "Manali long weekend"}
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
        {!isGroup ? (
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
        ) : (
          <p className="text-xs text-muted-foreground">
            Ongoing groups skip dates — use this for flatmates, dinners, and long-running splits.
          </p>
        )}
        {friends.length > 0 ? (
          <div className="space-y-2">
            <Label>Friends on this trip</Label>
            <p className="text-xs text-muted-foreground">
              Selected friends join with their profile linked — no seat claim needed.
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
              {friends.map((friend) => {
                const selected = selectedFriendIds.includes(friend.id)
                return (
                  <li key={friend.contactId}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                      <Checkbox
                        checked={selected}
                        disabled={busy}
                        onCheckedChange={() => onToggleFriend(friend.id)}
                      />
                      <span>
                        {friend.name}
                        {friend.username ? (
                          <span className="text-muted-foreground"> @{friend.username}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="person">Other nicknames (no account)</Label>
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
            You are on the roster automatically. Pick friends above or add nicknames
            for people without accounts.
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
                : "Add a friend or one more nickname."}
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

