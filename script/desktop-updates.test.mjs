import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { parse } from "yaml"
import { prepareDesktopUpdates, stageDesktopUpdates } from "./desktop-updates.mjs"
import { writeUpdateFixture } from "./fixtures/desktop-updates.mjs"

const version = "2.0.2"
const targets = ["win32-x64", "win32-arm64", "darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64"]

async function candidate(root, target) {
  const [platform, arch] = target.split("-")
  const directory = path.join(root, target)
  const source = path.join(directory, "build")
  const extension = platform === "win32" ? "exe" : platform === "darwin" ? "zip" : "AppImage"
  const filename = `subi-desktop-${platform}-${arch}.${extension}`
  const bytes = Buffer.from(`installer for ${target}`)
  const downloads = [{ product: "desktop", version, platform, arch, filename, size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex") }]
  await mkdir(source, { recursive: true })
  await writeFile(path.join(directory, filename), bytes)
  await writeFile(path.join(source, filename), bytes)
  await writeUpdateFixture(source, downloads)
  if (platform === "win32") await writeFile(path.join(source, `${filename}.blockmap`), "blockmap fixture")
  const qualification = { version, platform: target }
  const updateFiles = await stageDesktopUpdates(source, directory, qualification, downloads)
  return { directory, source, qualification, record: { downloads, updateFiles } }
}

test("merges both Windows/macOS architectures and keeps separate Linux feeds and blockmaps", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "subi-update-contract-"))
  try {
    const records = await Promise.all(targets.map((target) => candidate(root, target)))
    const assets = await prepareDesktopUpdates(root, version, records)
    assert.deepEqual(assets.map((item) => item.filename).sort(), [
      "latest.yml", "latest-mac.yml", "latest-linux.yml", "latest-linux-arm64.yml",
      "subi-desktop-win32-x64.exe.blockmap", "subi-desktop-win32-arm64.exe.blockmap",
    ].sort())
    for (const [filename, count] of [["latest.yml", 2], ["latest-mac.yml", 2], ["latest-linux.yml", 1], ["latest-linux-arm64.yml", 1]]) {
      const feed = parse(await readFile(path.join(root, filename), "utf8"))
      assert.equal(feed.version, version)
      assert.equal(feed.files.length, count)
      assert.equal(feed.path, feed.files[0].url)
      assert.equal(feed.sha512, feed.files[0].sha512)
      if (count === 2) {
        assert.ok(feed.files.some((item) => item.url.includes("arm64")))
        assert.ok(feed.files.some((item) => item.url.includes("x64")))
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

for (const failure of ["changed metadata", "changed installer", "missing feed", "wrong version", "path escape"]) {
  test(`rejects ${failure} before a release can publish its update feed`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "subi-update-rejected-"))
    try {
      const value = await candidate(root, "win32-x64")
      if (failure === "changed metadata") await writeFile(path.join(value.directory, "updates/latest.yml"), "version: altered")
      if (failure === "changed installer") await writeFile(path.join(value.directory, value.record.downloads[0].filename), "changed")
      if (failure === "missing feed") value.record.updateFiles = []
      if (failure === "path escape") value.record.updateFiles[0].filename = "../latest.yml"
      await assert.rejects(prepareDesktopUpdates(root, failure === "wrong version" ? "2.0.3" : version, [value]))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

for (const platform of ["win32", "darwin"]) {
  test(`requires both ${platform} architectures before publishing a shared update feed`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "subi-update-coverage-"))
    try {
      const x64 = await candidate(root, `${platform}-x64`)
      await assert.rejects(prepareDesktopUpdates(root, version, [x64]), /both x64 and arm64/)
      const arm64 = await candidate(root, `${platform}-arm64`)
      const assets = await prepareDesktopUpdates(root, version, [x64, arm64])
      const feed = parse(await readFile(assets.find(item => item.filename.endsWith(".yml")).file, "utf8"))
      assert.equal(feed.files.length, 2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
