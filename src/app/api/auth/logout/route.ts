import { assertWriteRequest, fail, json } from "@/lib/http"
import { clearSession } from "@/lib/session"

export async function POST(request: Request) {
  try { assertWriteRequest(request, false); await clearSession(); return json({ ok: true }) }
  catch (error) { return fail(error) }
}
