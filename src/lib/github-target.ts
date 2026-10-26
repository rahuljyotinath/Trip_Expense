export const DEFAULT_GITHUB_REPO = "rahuljyotinath/Trip_Expense"
export const DEFAULT_GITHUB_BRANCH = "main"
export const DEFAULT_REMOTE_PATH = "data/store.json"

export type GithubTarget = {
  owner: string
  repo: string
  fullName: string
  branch: string
  filePath: string
  hasToken: boolean
}

export function resolveGithubTarget(): GithubTarget {
  const raw = (process.env.GITHUB_REPO || DEFAULT_GITHUB_REPO).trim()
  const [owner = "", name = ""] = raw.split("/")
  const fullName = owner && name ? `${owner}/${name}` : DEFAULT_GITHUB_REPO
  const [safeOwner, safeName] = fullName.split("/")
  return {
    owner: safeOwner,
    repo: safeName,
    fullName,
    branch: process.env.GITHUB_BRANCH?.trim() || DEFAULT_GITHUB_BRANCH,
    filePath: process.env.GITHUB_DB_PATH?.trim() || DEFAULT_REMOTE_PATH,
    hasToken: Boolean(process.env.GITHUB_TOKEN?.trim()),
  }
}

export function githubUrl(target: GithubTarget) {
  return `https://github.com/${target.fullName}`
}
