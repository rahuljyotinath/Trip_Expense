import { probeGithub, storageErrorMessage, storageMode } from "@/lib/db"
import { json } from "@/lib/http"

export async function GET() {
  const mode = storageMode()
  const probe = await probeGithub()
  return json({
    mode,
    connected: probe.connected,
    warning: storageErrorMessage(probe),
    repo: probe.fullName,
    githubUrl: probe.githubUrl,
    branch: probe.branch,
    filePath: probe.filePath,
    error: probe.error,
  })
}
