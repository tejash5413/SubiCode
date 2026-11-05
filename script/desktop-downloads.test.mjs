import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { writeUpdateFixture } from "./fixtures/desktop-updates.mjs"

const scripts = path.dirname(fileURLToPath(import.meta.url))

test("desktop publication checks each product without releasing an unverified extension", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "subi-download-contract-"))
  try {
    for (const [name, desktopOnly, desktop, extension, failure, accepted, version = "2.0.2", updateDelivery] of [
      ["stale-version", false, "passed: startup", "passed: terminal reuse", undefined, false, "2.0.0"],
      ["complete", false, "passed: startup", "passed: terminal reuse", undefined, true],
      ["pending-extension", false, "passed: startup", undefined, "VS Code extension host qualification did not complete", false],
      ["desktop-only", true, "passed: startup", undefined, "VS Code extension host qualification did not complete", true],
      ["manual-desktop", true, "passed: startup", undefined, "VS Code extension host qualification did not complete", true, "2.0.2", "manual-github"],
      ["failed-desktop", true, "failed", undefined, "VS Code extension host qualification did not complete", false],
      ["unrelated-failure", true, "passed: startup", undefined, "Installer checksum mismatch", false],
    ]) {
      const source = path.join(root, name, "candidate")
      const output = path.join(root, name, "downloads")
      const destination = path.join(output, "subicode-downloads-darwin-x64")
      await mkdir(path.join(source, "desktop"), { recursive: true })
      await mkdir(path.join(source, "packages"))
      await writeFile(path.join(source, "desktop/subi-desktop-mac-x64.dmg"), "installer fixture")
      await writeFile(path.join(source, "subicode-darwin-x64.vsix"), "extension fixture")
      await writeUpdateFixture(path.join(source, "desktop"), [{ product: "desktop", platform: "darwin", arch: "x64", version, filename: "subi-desktop-mac-x64.dmg" }])
      await writeFile(path.join(source, "packages/qualification.json"), JSON.stringify({
        version, channel: "prod", platform: "darwin-x64",
        nativeExecution: "passed: native version", desktopExecution: desktop,
        extensionExecution: extension, failure, npm: { sourceCommit: "a".repeat(40) },
        desktopUpdateDelivery: updateDelivery, manualUpdatePolicy: updateDelivery ? "passed: manual download UI" : undefined,
      }))
      const flags = desktopOnly ? ["--desktop-only"] : []
      const prepared = spawnSync(process.execPath, [path.join(scripts, "prepare-desktop-downloads.mjs"), source, destination, ...flags], { encoding: "utf8", windowsHide: true })
      assert.equal(prepared.status === 0, accepted, `${name}: ${prepared.stderr}`)
      if (!accepted) continue
      const armSource = path.join(root, name, "candidate-arm64")
      const armDestination = path.join(output, "subicode-downloads-darwin-arm64")
      await mkdir(path.join(armSource, "desktop"), { recursive: true })
      await mkdir(path.join(armSource, "packages"))
      await writeFile(path.join(armSource, "desktop/subi-desktop-mac-arm64.dmg"), "arm installer fixture")
      await writeFile(path.join(armSource, "subicode-darwin-arm64.vsix"), "arm extension fixture")
      await writeUpdateFixture(path.join(armSource, "desktop"), [{ product: "desktop", platform: "darwin", arch: "arm64", version, filename: "subi-desktop-mac-arm64.dmg" }])
      await writeFile(path.join(armSource, "packages/qualification.json"), JSON.stringify({
        version, channel: "prod", platform: "darwin-arm64",
        nativeExecution: "passed: native version", desktopExecution: desktop,
        extensionExecution: extension, failure, npm: { sourceCommit: "a".repeat(40) },
        desktopUpdateDelivery: updateDelivery, manualUpdatePolicy: updateDelivery ? "passed: manual download UI" : undefined,
      }))
      const armPrepared = spawnSync(process.execPath, [path.join(scripts, "prepare-desktop-downloads.mjs"), armSource, armDestination, ...flags], { encoding: "utf8", windowsHide: true })
      assert.equal(armPrepared.status, 0, armPrepared.stderr)
      const record = JSON.parse(await readFile(path.join(destination, "downloads-darwin-x64.json"), "utf8"))
      assert.deepEqual(record.downloads.map(item => item.product), desktopOnly ? ["desktop"] : ["desktop", "vscode"])
      const verify = extra => spawnSync(process.execPath, [path.join(scripts, "publish-subicode-desktop.mjs"), output, ...extra], {
        encoding: "utf8", windowsHide: true, env: { ...process.env, SUBICODE_DESKTOP_PLATFORMS: "darwin-x64,darwin-arm64" },
      })
      const verified = verify(flags)
      assert.equal(verified.status, 0, `${name}: ${verified.stderr}`)
      if (updateDelivery) {
        const manifest = JSON.parse(await readFile(path.join(output, "subicode-release.json"), "utf8"))
        assert.equal(manifest.updateDelivery, "manual-github")
        assert.deepEqual(manifest.updateAssets, [])
        record.manualUpdatePolicy = "pending"
        await writeFile(path.join(destination, "downloads-darwin-x64.json"), JSON.stringify(record))
        assert.notEqual(verify(flags).status, 0, "Manual downloads still require native UI qualification")
        record.manualUpdatePolicy = "passed: manual download UI"
        await writeFile(path.join(destination, "downloads-darwin-x64.json"), JSON.stringify(record))
      }
      if (desktopOnly) {
        assert.notEqual(verify([]).status, 0, "Full publication still requires extension qualification")
        record.downloads.push({ ...record.downloads[0], product: "vscode", filename: "subicode-darwin-x64.vsix" })
        await writeFile(path.join(destination, "downloads-darwin-x64.json"), JSON.stringify(record))
        assert.notEqual(verify(flags).status, 0, "Desktop-only publication rejects VSIX files")
        record.downloads.pop()
        await writeFile(path.join(destination, "downloads-darwin-x64.json"), JSON.stringify(record))
      }
      await writeFile(path.join(destination, record.downloads[0].filename), "changed bytes")
      assert.notEqual(verify(flags).status, 0, "Installer bytes must still match qualification checksums")
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
