import path from "node:path"
import { Schema } from "effect"
import { Product } from "@opencode/util/product"

const targets = ["win32-x64", "win32-arm64", "darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64"]
const release = Schema.decodeUnknownSync(Schema.Struct({
  name: Schema.Literal(Product.updates.cli.package),
  version: Schema.String,
  optionalDependencies: Schema.Record(Schema.String, Schema.String),
}))

/** Only the public launcher owns upgrades; its six native packages must stay in lockstep. */
export function npmRelease(input: unknown) {
  const value = release(input)
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version) ||
      !targets.every(target => value.optionalDependencies[`${value.name}-${target}`] === value.version))
    throw new Error("The SubiCode npm release has an invalid version or mismatched native packages.")
  return value.version
}

/** A bundled desktop/VSIX binary or an upstream package must never update the global CLI. */
export function npmInstallation(name: string, directory: string, executable: string) {
  return targets.some(target => name === `${Product.updates.cli.package}-${target}` &&
    path.resolve(directory, "bin", target.startsWith("win32-") ? "subi.exe" : "subi") === executable)
}

/** Explicit registry and fixed package identity prevent inherited upstream package names. */
export function npmUpgradeCommand(version: string) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error(`Invalid version: ${version}`)
  return ["npm", "install", "--global", "--include=optional", `--registry=${Product.updates.cli.registry}`,
    `${Product.updates.cli.package}@${version}`]
}
