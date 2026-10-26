import assert from "node:assert/strict"
import test from "node:test"
import { storageMode } from "./storage-mode"

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

test("storageMode is postgres when POSTGRES_URL is set", () => {
  const previous = {
    postgres: process.env.POSTGRES_URL,
    database: process.env.DATABASE_URL,
    vercel: process.env.VERCEL,
  }
  delete process.env.VERCEL
  process.env.POSTGRES_URL = "postgres://example"
  try {
    assert.equal(storageMode(), "postgres")
  } finally {
    restore("POSTGRES_URL", previous.postgres)
    restore("DATABASE_URL", previous.database)
    restore("VERCEL", previous.vercel)
  }
})

test("storageMode is unconfigured on Vercel without postgres", () => {
  const previous = {
    postgres: process.env.POSTGRES_URL,
    database: process.env.DATABASE_URL,
    vercel: process.env.VERCEL,
  }
  delete process.env.POSTGRES_URL
  delete process.env.DATABASE_URL
  process.env.VERCEL = "1"
  try {
    assert.equal(storageMode(), "unconfigured")
  } finally {
    restore("POSTGRES_URL", previous.postgres)
    restore("DATABASE_URL", previous.database)
    restore("VERCEL", previous.vercel)
  }
})

test("storageMode is local without postgres or vercel", () => {
  const previous = {
    postgres: process.env.POSTGRES_URL,
    database: process.env.DATABASE_URL,
    vercel: process.env.VERCEL,
  }
  delete process.env.POSTGRES_URL
  delete process.env.DATABASE_URL
  delete process.env.VERCEL
  try {
    assert.equal(storageMode(), "local")
  } finally {
    restore("POSTGRES_URL", previous.postgres)
    restore("DATABASE_URL", previous.database)
    restore("VERCEL", previous.vercel)
  }
})
