import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { parse, stringify } from "yaml"

const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex")
const sha512 = (bytes) => createHash("sha512").update(bytes).digest("base64")

function filename(value) {
  assert.equal(typeof value, "string", "Update asset needs a filename")
  assert.match(value, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Update assets must be local filenames")
  return value
}

function feedName(platform, arch) {
  if (platform === "win32") return "latest.yml"
  if (platform === "darwin") return "latest-mac.yml"
  assert.equal(platform, "linux")
  return arch === "arm64" ? "latest-linux-arm64.yml" : "latest-linux.yml"
}

async function metadata(file, version, downloads, directory) {
  const value = parse(await readFile(file, "utf8"), { uniqueKeys: true })
  assert.equal(value.version, version, "Update metadata version must match the qualified installers")
  assert.ok(Array.isArray(value.files) && value.files.length > 0, "Update metadata needs installer entries")
  const names = new Set()
  for (const item of value.files) {
    const name = filename(item.url)
    assert.ok(!names.has(name), "Duplicate installer in update metadata")
    names.add(name)
    const download = downloads.find((entry) => entry.product === "desktop" && entry.filename === name)
    assert.ok(download, `Update metadata references an unqualified installer: ${name}`)
    const bytes = await readFile(path.join(directory, name))
    assert.equal(checksum(bytes), download.sha256, `Qualified installer changed: ${name}`)
    assert.equal(item.sha512, sha512(bytes), `Update SHA-512 mismatch: ${name}`)
    if (item.size !== undefined) assert.equal(item.size, bytes.length, `Update size mismatch: ${name}`)
  }
  if (value.path !== undefined) {
    filename(value.path)
    const selected = value.files.find((item) => item.url === value.path)
    assert.ok(selected, "Legacy update path must name a listed installer")
    assert.equal(value.sha512, selected.sha512, "Legacy update checksum must match its installer")
  }
  return value
}

/** Keep each native builder's feed separate until all qualified platforms are combined. */
export async function stageDesktopUpdates(source, destination, qualification, downloads) {
  const [platform, arch] = qualification.platform.split("-")
  const name = feedName(platform, arch)
  await metadata(path.join(source, name), qualification.version, downloads, destination)
  await mkdir(path.join(destination, "updates"), { recursive: true })
  const files = [name, ...(await readdir(source)).filter((entry) =>
    entry.endsWith(".blockmap") && downloads.some((item) => `${item.filename}.blockmap` === entry))]
  return Promise.all(files.map(async (name) => {
    filename(name)
    const bytes = await readFile(path.join(source, name))
    assert.ok(bytes.length > 0, `Empty update asset: ${name}`)
    await copyFile(path.join(source, name), path.join(destination, "updates", name))
    return { filename: name, size: bytes.length, sha256: checksum(bytes) }
  }))
}

/** Merge x64/ARM64 feeds without losing either architecture or accepting changed bytes. */
export async function prepareDesktopUpdates(root, version, records) {
  const architectures = new Map()
  const feeds = new Map()
  const assets = new Map()
  for (const { directory, record } of records) {
    const desktop = record.downloads.find((item) => item.product === "desktop")
    assert.ok(desktop, "Updater metadata needs a qualified desktop")
    const { platform, arch } = desktop
    const covered = architectures.get(platform) ?? new Set()
    covered.add(arch)
    architectures.set(platform, covered)
    const expected = feedName(platform, arch)
    assert.ok(Array.isArray(record.updateFiles) && record.updateFiles.some((item) => item.filename === expected),
      `Missing updater metadata for ${platform}/${arch}`)
    for (const item of record.updateFiles) {
      const name = filename(item.filename)
      assert.ok(name === expected || (name.endsWith(".blockmap") && record.downloads.some((download) =>
        `${download.filename}.blockmap` === name)), "Unexpected updater asset")
      const file = path.join(directory, "updates", name)
      const bytes = await readFile(file)
      assert.equal(item.size, bytes.length, `Updater asset size changed: ${name}`)
      assert.equal(item.sha256, checksum(bytes), `Updater asset checksum changed: ${name}`)
      if (name.endsWith(".yml")) {
        const value = await metadata(file, version, record.downloads, directory)
        const previous = feeds.get(name)
        if (!previous) feeds.set(name, value)
        else {
          for (const entry of value.files) {
            const duplicate = previous.files.find((item) => item.url === entry.url)
            if (duplicate) assert.deepEqual(duplicate, entry, "Conflicting architecture entries")
            else previous.files.push(entry)
          }
        }
      } else {
        const previous = assets.get(name)
        if (previous) assert.equal(previous.sha256, item.sha256, "Conflicting blockmaps")
        else {
          const target = path.join(root, name)
          await copyFile(file, target)
          assets.set(name, { ...item, file: target })
        }
      }
    }
  }
  // Shared Windows/macOS feeds are immutable after release; publish both architectures together.
  for (const platform of ["win32", "darwin"]) {
    const covered = architectures.get(platform)
    if (covered) assert.ok(covered.has("x64") && covered.has("arm64"), `${platform} update feeds require both x64 and arm64 before publication`)
  }
  for (const [name, value] of feeds) {
    value.files.sort((a, b) => Number(a.url.includes("arm64")) - Number(b.url.includes("arm64")) || a.url.localeCompare(b.url))
    value.path = value.files[0].url
    value.sha512 = value.files[0].sha512
    const file = path.join(root, name)
    const bytes = Buffer.from(stringify(value))
    await writeFile(file, bytes)
    assets.set(name, { filename: name, file, size: bytes.length, sha256: checksum(bytes) })
  }
  return [...assets.values()]
}
