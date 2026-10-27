/** Hinglish invite copy for WhatsApp forwards (India GTM). */
export function whatsappInviteMessage(tripName: string, inviteUrl: string) {
  const name = tripName.trim() || "Trip"
  return [
    "Trip ka hisaab yahan 📒",
    "",
    name,
    inviteUrl,
    "",
    "Sign in → link kholo → apna naam claim karo → spends add karo.",
    "Private trip — sirf invite wale log. App bilkul free hai.",
  ].join("\n")
}

export function whatsappShareUrl(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
