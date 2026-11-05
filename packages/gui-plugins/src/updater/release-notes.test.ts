import { expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { ReleaseNotes, releaseHighlights } from "./release-notes"

function release(tag: string, fields: Partial<(typeof ReleaseNotes.Type)[number]> = {}) {
  return { tag_name: tag, name: `SubiCode ${tag}`, body: `Changes in ${tag}`, draft: false, prerelease: false, ...fields }
}

const releases = Schema.decodeUnknownSync(ReleaseNotes)([
  release("v2.0.2"),
  release("v2.0.1"),
  release("v3.0.0"),
  release("v2.0.10"),
  release("v2.0.9"),
  release("v2.0.7", { draft: true }),
  release("v2.0.8", { prerelease: true }),
  release("v2.0.6-beta.1"),
  release("v2.0.5", { body: null }),
  release("v2.0.4", { body: "  " }),
])

test.each([
  ["only the installed update", "2.0.2", "2.0.1", ["v2.0.2"]],
  ["numeric version order", "2.0.10", "2.0.1", ["v2.0.10", "v2.0.9", "v2.0.2"]],
  ["an unpublished current tag", "2.0.3", "2.0.1", ["v2.0.2"]],
  ["version prefixes", "V2.0.10", "v2.0.2", ["v2.0.10", "v2.0.9"]],
  ["an unchanged install", "2.0.2", "2.0.2", []],
  ["a downgrade", "2.0.1", "2.0.10", []],
  ["an unknown previous version", "2.0.10", "dev", []],
  ["a beta install", "2.0.10-beta.1", "2.0.1", []],
] as const)("release notes: %s", (_, current, previous, expected) => {
  expect(releaseHighlights(releases, current, previous).map((note) => note.title)).toEqual(
    expected.map((tag) => `SubiCode ${tag}`),
  )
})

test("preserves GitHub release text and provides the product title for unnamed releases", () => {
  expect(releaseHighlights([release("v2.0.2", { name: null, body: "  ## Updates\n\nMCP connections fixed.  " })], "2.0.2", "2.0.1"))
    .toEqual([{ title: "SubiCode v2.0.2", description: "## Updates\n\nMCP connections fixed." }])
  expect(Option.isNone(Schema.decodeUnknownOption(ReleaseNotes)({ message: "API rate limit exceeded" }))).toBe(true)
})

test("limits a long update history to the five most recent installed releases", () => {
  const list = Array.from({ length: 20 }, (_, i) => release(`v2.0.${i + 1}`))
  expect(releaseHighlights(list, "2.0.20", "2.0.1").map((note) => note.title)).toEqual([
    "SubiCode v2.0.20", "SubiCode v2.0.19", "SubiCode v2.0.18", "SubiCode v2.0.17", "SubiCode v2.0.16",
  ])
})
