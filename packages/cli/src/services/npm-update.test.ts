import { describe, expect, test } from "bun:test"
import path from "node:path"
import { npmInstallation, npmRelease, npmUpgradeCommand } from "./npm-update"

const targets = ["win32-x64", "win32-arm64", "darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64"]
const name = "@subicodeagent/subi-cli"
const manifest = (version = "2.0.2") => ({
  name, version,
  optionalDependencies: Object.fromEntries(targets.map(target => [`${name}-${target}`, version])),
})

describe("SubiCode npm update boundary", () => {
  test.each(targets)("recognizes the %s native package but excludes bundled and upstream binaries", target => {
    const directory = path.resolve("node_modules", `${name}-${target}`)
    const executable = path.join(directory, "bin", target.startsWith("win32-") ? "subi.exe" : "subi")
    expect(npmInstallation(`${name}-${target}`, directory, executable)).toBe(true)
    expect(npmInstallation("@opencode/cli", directory, executable)).toBe(false)
    expect(npmInstallation(`${name}-${target}`, directory, path.resolve("resources/opencode-cli"))).toBe(false)
    expect(npmInstallation(`${name}-${target}`, directory, path.join(directory, "bin/bun.exe"))).toBe(false)
  })

  test("accepts only our stable launcher with six matching native versions", () => {
    expect(npmRelease(manifest())).toBe("2.0.2")
    for (const target of targets) {
      const mismatch = manifest()
      mismatch.optionalDependencies[`${name}-${target}`] = "2.0.1"
      expect(() => npmRelease(mismatch)).toThrow()
      delete mismatch.optionalDependencies[`${name}-${target}`]
      expect(() => npmRelease(mismatch)).toThrow()
    }
    for (const input of [null, {}, { ...manifest(), name: "@opencode/cli" }, manifest("2.0.2-beta.1"), manifest("2.0.02")])
      expect(() => npmRelease(input)).toThrow()
  })

  test("uses the public npm registry and a pinned launcher, with no force overwrite", () => {
    expect(npmUpgradeCommand("2.0.2")).toEqual([
      "npm", "install", "--global", "--include=optional", "--registry=https://registry.npmjs.org",
      "@subicodeagent/subi-cli@2.0.2",
    ])
    for (const version of ["latest", "2.0.2 --force", "https://example.com/install.tgz", "2.0.2-beta.1"])
      expect(() => npmUpgradeCommand(version)).toThrow()
  })
})
