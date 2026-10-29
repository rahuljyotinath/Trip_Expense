export class ApiError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_REQUEST") { super(message) }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } })
}

export function fail(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status)
  const databaseCode = (error as { code?: string })?.code
  if (databaseCode === "23505") return json({ error: "That value is already in use.", code: "CONFLICT" }, 409)
  if (databaseCode || error instanceof TypeError || error instanceof SyntaxError) return json({ error: fallback, code: "SERVICE_UNAVAILABLE" }, 503)
  const message = error instanceof Error ? error.message : ""
  const expected = /^(Only |Trip |Profile |Set up |Sign in |Unknown |That |You |Someone |A |An |Give |End date|Start date|Date |Amount |What |Payer |Receiver |Pick |Percents |Expense |Payment |Member |CSV |Invalid |Unrecognized |Currency |Admin |Join |Enter |Username|Password |Display name|Email |Phone |Cover |Order |No |Choose |Add |Cannot |Recovery )/.test(message)
  if (!expected) return json({ error: fallback, code: "INTERNAL_ERROR" }, 500)
  const status = /not found/i.test(message) ? 404 : /Only |access|approve.*before|Claim your nickname/.test(message) ? 403 : /Unknown username|Sign in again/.test(message) ? 401 : 400
  return json({ error: message, code: status === 403 ? "FORBIDDEN" : status === 401 ? "UNAUTHORIZED" : "INVALID_REQUEST" }, status)
}

export function failServiceUnavailable(_message?: string) {
  return json({ error: "The service is temporarily unavailable. Please try again later.", code: "SERVICE_UNAVAILABLE" }, 503)
}

export function assertWriteRequest(request: Request, hasBody = true) {
  if (hasBody && request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError("Send a JSON request.", 415, "UNSUPPORTED_MEDIA_TYPE")
  }
  if (request.headers.get("authorization")?.startsWith("Bearer ")) return
  const origin = request.headers.get("origin")
  const allowed = new Set([new URL(request.url).origin])
  if (process.env.NEXT_PUBLIC_APP_URL) { try { allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin) } catch { /* invalid config is not trusted */ } }
  if ((origin && !allowed.has(origin)) || (!origin && ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? ""))) {
    throw new ApiError(
      `This request must come from ${process.env.NEXT_PUBLIC_APP_DISPLAY_NAME?.trim() || "Tripzy"}.`,
      403,
      "FORBIDDEN_ORIGIN"
    )
  }
}

const limits: Record<string, number> = {
  username: 40, password: 1024, currentPassword: 1024, newPassword: 1024, recoveryCode: 128,
  action: 48, name: 60, currency: 3, startDate: 10, endDate: 10, date: 10,
  profileId: 128, memberId: 128, paidByMemberId: 128, expenseId: 128, paymentId: 128,
  clientOpId: 128, fromMemberId: 128, toMemberId: 128, coveredByMemberId: 128,
  inviteId: 128, requestId: 128, targetProfileId: 128, email: 120, phone: 20,
  upiId: 100, code: 32, reason: 120, csv: 2000000, query: 120,
}
const nullable = new Set(["startDate", "endDate", "coveredByMemberId", "targetProfileId", "email", "phone", "upiId"])

export function validateBody(value: unknown): asserts value is Record<string, unknown> {
  const invalid = () => { throw new ApiError("Invalid request fields.") }
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid()
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (field === null && nullable.has(key)) continue
    if (Object.hasOwn(limits, key)) { if (typeof field !== "string" || field.length > limits[key]) invalid(); continue }
    if (["restore", "isAdmin"].includes(key)) { if (typeof field !== "boolean") invalid(); continue }
    if (key === "amount") { if (typeof field !== "number" || !Number.isFinite(field) || field < 0.01 || field > 1_000_000_000) invalid(); continue }
    if (key === "split") { if (field !== "equal" && field !== "percent") invalid(); continue }
    if (["memberNames", "participantIds", "orderedIds"].includes(key)) {
      if (!Array.isArray(field) || field.length > 500 || field.some((v) => typeof v !== "string" || v.length > (key === "memberNames" ? 40 : 128))) invalid()
      continue
    }
    if (key === "roster") {
      if (!Array.isArray(field) || field.length > 500 || field.some((row) => !row || typeof row !== "object" || typeof row.name !== "string" || row.name.length > 40 || (row.profileId != null && (typeof row.profileId !== "string" || row.profileId.length > 128)) || Object.keys(row).some((key) => !["name", "profileId"].includes(key)))) invalid()
      continue
    }
    if (key === "shares") {
      if (!field || typeof field !== "object" || Array.isArray(field) || Object.entries(field).length > 500 || Object.entries(field).some(([id, v]) => ["__proto__", "constructor", "prototype"].includes(id) || id.length > 128 || typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 100)) invalid()
      continue
    }
    invalid()
  }
}

export async function readBody<T>(request: Request): Promise<T> {
  assertWriteRequest(request)
  const max = 2100000
  if (Number(request.headers.get("content-length")) > max) throw new ApiError("Request is too large.", 413, "PAYLOAD_TOO_LARGE")
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError("Send a JSON request.")
  const chunks: Uint8Array[] = []; let size = 0
  const timeout = setTimeout(() => { void reader.cancel() }, 10000)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) { await reader.cancel(); throw new ApiError("Request is too large.", 413, "PAYLOAD_TOO_LARGE") }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size); let at = 0
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength }
    let body: unknown
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { throw new ApiError("Invalid JSON request.") }
    validateBody(body)
    return body as T
  } finally { clearTimeout(timeout); reader.releaseLock() }
}
