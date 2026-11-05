import { Schema } from "effect"
import { Product } from "@opencode/util/product"
import { releaseVersion, compareReleaseVersions } from "./release-version"

export const ReleaseNotes = Schema.Array(
  Schema.Struct({
    tag_name: Schema.String,
    name: Schema.NullOr(Schema.String),
    body: Schema.NullOr(Schema.String),
    draft: Schema.Boolean,
    prerelease: Schema.Boolean,
  }),
)

export type ReleaseHighlight = {
  title: string
  description: string
  media?: { type: "image" | "video"; src: string; alt?: string }
}

/** Published stable releases newer than the previous install and no newer than this install. */
export function releaseHighlights(list: typeof ReleaseNotes.Type, current: string, previous: string): ReleaseHighlight[] {
  const now = releaseVersion(current)
  const before = releaseVersion(previous)

  if (!now || !before || compareReleaseVersions(now, before) <= 0) return []

  return list
    .flatMap((release) => {
      const target = releaseVersion(release.tag_name)
      const description = release.body?.trim()

      if (release.draft || release.prerelease || !target || !description) return []

      if (compareReleaseVersions(target, now) > 0 || compareReleaseVersions(target, before) <= 0) return []

      return [{ target, title: release.name?.trim() || `${Product.name} ${release.tag_name}`, description }]
    })
    .sort((a, b) => compareReleaseVersions(b.target, a.target))
    .slice(0, 5)
    .map(({ title, description }) => ({ title, description }))
}

