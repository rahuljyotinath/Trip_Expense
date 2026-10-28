/** Hinglish invite copy for WhatsApp forwards (India GTM). */
export function whatsappInviteMessage(tripName: string, inviteUrl: string) {
  const name = tripName.trim() || "Trip"
  return [
    "Trip ka hisaab yahan 📒",
    "",
    name,
    inviteUrl,
    "",
    "Link kholo → account banao ya sign in → apna naam claim karo.",
    "Private trip — sirf invite wale log. App bilkul free hai.",
  ].join("\n")
}

export function whatsappShareUrl(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
