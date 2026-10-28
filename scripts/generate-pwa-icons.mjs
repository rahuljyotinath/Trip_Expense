#!/usr/bin/env node
/**
 * Generates PNG PWA icons from public/icon.svg (requires sharp: npx sharp-cli or npm i -D sharp).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const svgPath = path.join(root, "public/icon.svg")
const outDir = path.join(root, "public/icons")

async function main() {
  let sharp
  try {
    sharp = (await import("sharp")).default
  } catch {
    console.error("Install sharp: npm i -D sharp")
    process.exit(1)
  }
  const svg = await readFile(svgPath)
  await mkdir(outDir, { recursive: true })
  for (const size of [192, 512]) {
    const png = await sharp(svg).resize(size, size).png().toBuffer()
    await writeFile(path.join(outDir, `icon-${size}.png`), png)
  }
  console.log("Wrote public/icons/icon-192.png and icon-512.png")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
