import assert from "node:assert/strict"
import test from "node:test"
import { storageMode } from "./storage-mode"

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

test("storageMode prefers postgres over github", () => {
  const previous = {
    postgres: process.env.POSTGRES_URL,
    database: process.env.DATABASE_URL,
    token: process.env.GITHUB_TOKEN,
    vercel: process.env.VERCEL,
  }
  delete process.env.VERCEL
  process.env.POSTGRES_URL = "postgres://example"
  process.env.GITHUB_TOKEN = "gh_test"
  try {
    assert.equal(storageMode(), "postgres")
  } finally {
    restore("POSTGRES_URL", previous.postgres)
    restore("DATABASE_URL", previous.database)
    restore("GITHUB_TOKEN", previous.token)
    restore("VERCEL", previous.vercel)
  }
})

test("storageMode uses github when postgres unset", () => {
  const previous = {
    postgres: process.env.POSTGRES_URL,
    database: process.env.DATABASE_URL,
    token: process.env.GITHUB_TOKEN,
    vercel: process.env.VERCEL,
  }
  delete process.env.POSTGRES_URL
  delete process.env.DATABASE_URL
  delete process.env.VERCEL
  process.env.GITHUB_TOKEN = "gh_test"
  try {
    assert.equal(storageMode(), "github")
  } finally {
    restore("POSTGRES_URL", previous.postgres)
    restore("DATABASE_URL", previous.database)
    restore("GITHUB_TOKEN", previous.token)
    restore("VERCEL", previous.vercel)
  }
})

test("storageMode is local without postgres, github, or vercel", () => {
  const previous = {
    postgres: process.env.POSTGRES_URL,
    database: process.env.DATABASE_URL,
    token: process.env.GITHUB_TOKEN,
    vercel: process.env.VERCEL,
  }
  delete process.env.POSTGRES_URL
  delete process.env.DATABASE_URL
  delete process.env.GITHUB_TOKEN
  delete process.env.VERCEL
  try {
    assert.equal(storageMode(), "local")
  } finally {
    restore("POSTGRES_URL", previous.postgres)
    restore("DATABASE_URL", previous.database)
    restore("GITHUB_TOKEN", previous.token)
    restore("VERCEL", previous.vercel)
  }
})
