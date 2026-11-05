import { Effect, Match, Option, Schema } from "effect"
import { Product } from "@opencode/util/product"
import type { Platform } from "./machine"
import { releaseVersion, compareReleaseVersions } from "./release-version"

export const GitHubRelease = Schema.Struct({
  tag_name: Schema.String,
  draft: Schema.Boolean,
  prerelease: Schema.Boolean,
  assets: Schema.Array(Schema.Struct({ name: Schema.String, size: Schema.Number })),
})

/** Offer only a newer stable release that includes an installer for the running platform and architecture. */
export function githubUpdate(
  release: typeof GitHubRelease.Type,
  current: string,
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
) {
  const installed = releaseVersion(current)
  const offered = releaseVersion(release.tag_name)

  if (release.draft || release.prerelease || !installed || !offered) return

  if (compareReleaseVersions(offered, installed) <= 0) return

  const installer = Match.value(platform).pipe(
    Match.when("win32", () => ({ os: "win", extensions: [".exe"] })),
    Match.when("darwin", () => ({ os: "mac", extensions: [".dmg", ".zip"] })),
    Match.when("linux", () => ({ os: "linux", extensions: [".AppImage", ".deb", ".rpm"] })),
    Match.orElse(() => undefined),
  )

  if (!installer || (arch !== "x64" && arch !== "arm64")) return

  const prefix = `subi-desktop-${installer.os}-${arch}.`

  const available = release.assets.some((asset) => asset.size > 0 && asset.name.startsWith(prefix) &&
    installer.extensions.some((extension) => asset.name.endsWith(extension)))

  if (!available) return

  return {
    mode: "external" as const,
    version: `${offered.major}.${offered.minor}.${offered.patch}`,
    url: `${Product.repository}/releases/tag/${encodeURIComponent(release.tag_name)}`,
  }
}

/** Checks metadata only. Downloading and running an installer remain explicit user actions. */
export function githubNotifier(current: string): Platform {
  return {
    checkForUpdate: Effect.tryPromise(async () => {
      const feed = Product.updates.desktop.feed

      const response = await fetch(`https://api.github.com/repos/${feed.owner}/${feed.repo}/releases/latest`, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: "application/vnd.github+json", "User-Agent": `${Product.name}/${current}` },
      })

      if (response.status === 404) return

      if (!response.ok) throw new Error(`SubiCode release check failed (HTTP ${response.status})`)

      const release = Schema.decodeUnknownOption(GitHubRelease)(await response.json())

      if (Option.isNone(release)) throw new Error("SubiCode release metadata is unavailable")

      return githubUpdate(release.value, current, process.platform, process.arch)
    }),
    externalInstall: (url) => Effect.tryPromise(async () => {
      const { shell } = await import("electron")
      await shell.openExternal(url)
    }),
    stageUpdate: () => Effect.fail(new Error("Download this SubiCode update from its GitHub release page")),
    installAndRestart: Effect.fail(new Error("Run the downloaded SubiCode installer to update")),
  }
}
