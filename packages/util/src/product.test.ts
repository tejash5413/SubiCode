import { expect, test } from "bun:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { brandCopy, brandMessages } from "./product.js"

test("a compiled release shows its embedded version instead of the source fallback", async () => {
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL("./product.ts", import.meta.url))],
    target: "bun",
    define: { OPENCODE_VERSION: JSON.stringify("2.0.2") },
  })
  expect(result.success).toBe(true)
  const directory = await mkdtemp(path.join(os.tmpdir(), "subi-version-"))
  try {
    const file = path.join(directory, "product.mjs")
    await Bun.write(file, result.outputs[0])
    const module = await import(pathToFileURL(file).href)
    expect(module.Product.version).toBe("2.0.2")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("inherited presentation copy uses Subi while retaining compatible identifiers and placeholders", () => {
  expect(brandCopy("OpenCode · opencode pair · opencode service get password")).toBe(
    "SubiCode · subi pair · subi service get password",
  )
  expect(brandCopy("opencode.json .opencode/ @opencode/client OPENCODE_PASSWORD {{account}} opencode://pair")).toBe(
    "opencode.json .opencode/ @opencode/client OPENCODE_PASSWORD {{account}} opencode://pair",
  )
  expect(brandMessages({ "opencode.key": "Ouvrir OpenCode", command: "Run opencode mcp add" })).toEqual({
    "opencode.key": "Ouvrir SubiCode",
    command: "Run subi mcp add",
  })
  expect(brandCopy("Check your config (opencode.json) provider/model names")).toBe(
    "Check your config provider/model names",
  )
  expect(brandCopy("www.opencode.ai")).toBe("stlearnsmart.in")
  expect(brandCopy("Scan the code in opencode.")).toBe("Scan the code in SubiCode.")
  expect(brandMessages({ "settings.extensions.manageConfig": "Gérer dans opencode.json" })).toEqual({
    "settings.extensions.manageConfig": "Gérer dans SubiCode",
  })
})

test.each([
  ["desktop.cli.installed.message", "CLI installed. Use 'opencode2'.", "CLI installed. Use 'subi'."],
  ["error.opencodeMissing", "Opencode ushbu tarqatishda o'rnatilmagan", "SubiCode ushbu tarqatishda o'rnatilmagan"],
  ["error.opencodeMissing", "opencodea ei ole asennettu tähän jakeluun", "SubiCodea ei ole asennettu tähän jakeluun"],
  [
    "error.opencodeCannotRun",
    "opencode-ը տեղադրված է, բայց չի կարող գործարկվել",
    "SubiCode-ը տեղադրված է, բայց չի կարող գործարկվել",
  ],
  ["project.settings.worktree.startup.hint.base", "Use $OPENCODE_WORKTREE_BASE", "Use $SUBI_WORKTREE_BASE"],
  ["project.settings.worktree.startup.hint.new", "Use $OPENCODE_WORKTREE_PATH", "Use $SUBI_WORKTREE_PATH"],
])("presentation key %s adapts legacy command and inflected names", (key, input, expected) => {
  expect(brandMessages({ [key]: input })[key]).toBe(expected)
})
