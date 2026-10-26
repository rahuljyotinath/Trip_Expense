import { probePostgres, storageErrorMessage, storageMode } from "@/lib/db"
import { json } from "@/lib/http"
import { connection } from "next/server"

export async function GET() {
  await connection()
  const mode = storageMode()
  if (mode === "postgres") {
    const postgres = await probePostgres()
    return json({
      mode,
      connected: postgres.connected,
      warning: storageErrorMessage(postgres),
      error: postgres.error,
      ledgerVersion: postgres.version ?? null,
    })
  }
  return json({
    mode,
    connected: mode === "local",
    warning: storageErrorMessage(),
    error: null,
  })
}
