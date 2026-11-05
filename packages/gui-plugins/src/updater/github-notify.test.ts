import { expect, test } from "bun:test"
import { Schema } from "effect"
import { GitHubRelease, githubUpdate } from "./github-notify"

const release = Schema.decodeUnknownSync(GitHubRelease)({
  tag_name: "v2.0.3", draft: false, prerelease: false,
  assets: [
    "subi-desktop-win-x64.exe", "subi-desktop-win-arm64.exe", "subi-desktop-mac-x64.dmg",
    "subi-desktop-mac-arm64.dmg", "subi-desktop-linux-x64.AppImage", "subi-desktop-linux-arm64.deb",
  ].map((name) => ({ name, size: 100 })),
})

test.each([
  ["win32", "x64"], ["win32", "arm64"], ["darwin", "x64"], ["darwin", "arm64"],
  ["linux", "x64"], ["linux", "arm64"],
] as const)("%s %s offers a manual SubiCode GitHub download", (platform, arch) => {
  expect(githubUpdate(release, "2.0.2", platform, arch)).toEqual({
    mode: "external", version: "2.0.3", url: "https://github.com/tejash5413/SubiCode/releases/tag/v2.0.3",
  })
})

test.each([
  ["installed version", { ...release, tag_name: "v2.0.2" }],
  ["older version", { ...release, tag_name: "v2.0.1" }],
  ["draft", { ...release, draft: true }],
  ["prerelease", { ...release, prerelease: true }],
  ["beta tag", { ...release, tag_name: "v2.0.3-beta.1" }],
  ["missing installer", { ...release, assets: [] }],
  ["blockmap only", { ...release, assets: [{ name: "subi-desktop-win-x64.exe.blockmap", size: 100 }] }],
  ["empty installer", { ...release, assets: [{ name: "subi-desktop-win-x64.exe", size: 0 }] }],
] as const)("does not offer %s", (_, candidate) => {
  expect(githubUpdate(candidate, "2.0.2", "win32", "x64")).toBeUndefined()
})
