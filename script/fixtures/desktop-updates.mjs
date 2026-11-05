import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { stringify } from "yaml"

export async function writeUpdateFixture(directory, downloads, installers = directory) {
  const desktop = downloads.filter((item) => item.product === "desktop")
  const { platform, arch, version } = desktop[0]
  const filename = platform === "win32" ? "latest.yml" : platform === "darwin" ? "latest-mac.yml"
    : arch === "arm64" ? "latest-linux-arm64.yml" : "latest-linux.yml"
  const files = await Promise.all(desktop.map(async (item) => {
    const bytes = await readFile(path.join(installers, item.filename))
    return { url: item.filename, size: bytes.length, sha512: createHash("sha512").update(bytes).digest("base64") }
  }))
  const bytes = Buffer.from(stringify({ version, files, path: files[0].url, sha512: files[0].sha512 }))
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, filename), bytes)
  return [{ filename, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }]
}
