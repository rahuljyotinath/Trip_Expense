"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import { applyGroupPatchOptimistic } from "@/lib/group-patch-optimistic"
import { todayIsoDate } from "@/lib/ids"
import { parseAmount } from "@/lib/money"
import type { Expense, Group, Payment, PublicProfile } from "@/lib/types"

function mySeat(group: Group, profileId: string) {
  return group.members.find((member) => member.profileId === profileId) ?? null
}

export function ExpenseDialog({
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
          Uncheck anyone who was not on this bill. The amount splits equally among
          everyone checked.
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

export function PaymentDialog({
  open,
  group,
  profile,
  busy,
  editingPayment,
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
  editingPayment?: Payment | null
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
          key={editingPayment?.id ?? "new"}
          group={group}
          profile={profile}
          busy={busy}
          editingPayment={editingPayment ?? null}
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
  editingPayment,
  onSaved,
  onRefresh,
  onError,
  onBusy,
}: {
  group: Group
  profile: PublicProfile
  busy: boolean
  editingPayment: Payment | null
  onSaved: (group: Group) => void
  onRefresh: () => Promise<void>
  onError: (message: string | null) => void
  onBusy: (value: boolean) => void
}) {
  const seat = mySeat(group, profile.id)
  const [date, setDate] = useState(editingPayment?.date ?? todayIsoDate())
  const [amount, setAmount] = useState(
    editingPayment ? String(editingPayment.amount) : ""
  )
  const [fromId, setFromId] = useState(
    editingPayment?.fromMemberId ?? seat?.id ?? group.members[0]?.id ?? ""
  )
  const [toId, setToId] = useState(
    editingPayment?.toMemberId ??
      group.members.find((member) => member.id !== (seat?.id ?? group.members[0]?.id))
        ?.id ??
      ""
  )

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editingPayment ? "Edit paid back" : "Record paid back"}</DialogTitle>
        <DialogDescription>
          Someone handed cash. This cuts the open tab. Delete later if that was a
          mistake.
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
            if (editingPayment) {
              applyGroupPatchOptimistic({
                group,
                profile,
                body: {
                  action: "void-payment",
                  paymentId: editingPayment.id,
                  profileId: profile.id,
                  restore: false,
                },
                onGroup: (afterVoid) => {
                  applyGroupPatchOptimistic({
                    group: afterVoid,
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
                },
                onError,
                onBusy,
                refresh: onRefresh,
              })
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
          {editingPayment ? "Save changes" : "Save payment"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
