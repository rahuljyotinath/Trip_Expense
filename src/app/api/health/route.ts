import { storageErrorMessage, storageMode } from "@/lib/db"
import { json } from "@/lib/http"

export async function GET() {
  const mode = storageMode()
  return json({
    mode,
    warning: storageErrorMessage(),
    repo: process.env.GITHUB_REPO ?? null,
  })
}
