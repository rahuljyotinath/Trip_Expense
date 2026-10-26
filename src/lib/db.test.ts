import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_GITHUB_BRANCH, DEFAULT_GITHUB_REPO, resolveGithubTarget } from "./github-target"

test("defaults GitHub target to rahuljyotinath/Trip_Expense on main", () => {
  const previous = {
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH,
    path: process.env.GITHUB_DB_PATH,
    token: process.env.GITHUB_TOKEN,
  }
  delete process.env.GITHUB_REPO
  delete process.env.GITHUB_BRANCH
  delete process.env.GITHUB_DB_PATH
  delete process.env.GITHUB_TOKEN
  try {
    const target = resolveGithubTarget()
    assert.equal(target.fullName, DEFAULT_GITHUB_REPO)
    assert.equal(target.owner, "rahuljyotinath")
    assert.equal(target.repo, "Trip_Expense")
    assert.equal(target.branch, DEFAULT_GITHUB_BRANCH)
    assert.equal(target.filePath, "data/store.json")
    assert.equal(target.hasToken, false)
  } finally {
    restore("GITHUB_REPO", previous.repo)
    restore("GITHUB_BRANCH", previous.branch)
    restore("GITHUB_DB_PATH", previous.path)
    restore("GITHUB_TOKEN", previous.token)
  }
})

test("honors GITHUB_REPO override", () => {
  const previous = process.env.GITHUB_REPO
  process.env.GITHUB_REPO = "acme/ledger"
  try {
    const target = resolveGithubTarget()
    assert.equal(target.fullName, "acme/ledger")
    assert.equal(target.owner, "acme")
    assert.equal(target.repo, "ledger")
  } finally {
    restore("GITHUB_REPO", previous)
  }
})

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
