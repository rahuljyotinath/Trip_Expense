"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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
import { formatMoney } from "@/lib/money"
import {
  buildUpiPayUri,
  isLikelyUpiVpa,
  recalledMemberUpiVpa,
  rememberMemberUpiVpa,
} from "@/lib/upi-pay"

export function UpiSettleButton({
  payeeMemberId,
  payeeName,
  amount,
  currency,
  note,
  size = "sm",
}: {
  payeeMemberId: string
  payeeName: string
  amount: number
  currency: string
  note: string
  size?: "sm" | "xs"
}) {
  const [open, setOpen] = useState(false)
  const [vpa, setVpa] = useState("")
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    setVpa(recalledMemberUpiVpa(payeeMemberId) ?? "")
    setError(null)
    setOpen(true)
  }

  function pay() {
    if (!isLikelyUpiVpa(vpa)) {
      setError("Enter a valid UPI ID (e.g. name@upi).")
      return
    }
    rememberMemberUpiVpa(payeeMemberId, vpa)
    const uri = buildUpiPayUri({
      vpa,
      payeeName,
      amount,
      currency,
      note,
    })
    window.location.href = uri
    setOpen(false)
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={openDialog}>
        Pay via UPI
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay on UPI</DialogTitle>
            <DialogDescription>
              Pay {formatMoney(amount, currency)} to {payeeName}. Opens GPay, PhonePe, or Paytm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="upi-vpa">{payeeName}&apos;s UPI ID</Label>
            <Input
              id="upi-vpa"
              value={vpa}
              placeholder="name@upi"
              autoComplete="off"
              onChange={(e) => {
                setVpa(e.target.value)
                setError(null)
              }}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={pay}>
              Open UPI app
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
