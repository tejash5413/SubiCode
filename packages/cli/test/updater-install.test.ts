import { NodeServices } from "@effect/platform-node"
import { EffectFlock } from "@opencode/util/effect-flock"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { expect, spyOn } from "bun:test"
import { Effect, FileSystem, Layer, PlatformError, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import path from "node:path"
import { Updater } from "../src/services/updater"
import { testEffect } from "../../core/test/lib/effect"

const it = testEffect(NodeServices.layer)

function fixture(
  respond: (command: ChildProcess.StandardCommand) => Partial<AppProcess.RunResult> & {
    error?: AppProcess.AppProcessError
  } = () => ({}),
  name = `@subicodeagent/subi-cli-${process.platform}-${process.arch}`,
  failCleanup = false,
  releasePackage = "@subicodeagent/subi-cli",
  formula?: string,
  executableOverride?: (root: string, home: string) => Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem>,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "opencode-updater-" })
    const execPath = process.execPath
    const modules = path.join(root, "node_modules")
    const executable = executableOverride
      ? yield* executableOverride(root, path.join(root, "home"))
      : formula
        ? path.join(root, "Cellar", formula, "2.0.20", "bin", "opencode")
        : path.join(modules, "@subicodeagent", name.split("/")[1], "bin", process.platform === "win32" ? "subi.exe" : "subi")
    yield* fs.makeDirectory(path.dirname(executable), { recursive: true })
    yield* fs.writeFileString(executable, "binary")
    if (!formula && !executableOverride)
      yield* fs.writeFileString(
        path.join(path.dirname(path.dirname(executable)), "package.json"),
        JSON.stringify({ name, bin: { opencode: "bin/opencode" } }),
      )
    const requests: string[] = []
    // The updater uses global fetch; scope this replacement to each install test.
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        spyOn(globalThis, "fetch").mockImplementation(
          Object.assign(
            async (input: string | URL | Request) => {
              const url = input instanceof Request ? input.url : input.toString()
              requests.push(url)
              if (new URL(url).hostname === "formulae.brew.sh") return Response.json({ versions: { stable: "2.0.21" } })
              return Response.json({ name: releasePackage, version: "2.3.4", optionalDependencies: Object.fromEntries(["win32-x64", "win32-arm64", "darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64"].map(target => [`${releasePackage}-${target}`, "2.3.4"])) })
            },
            { preconnect: fetch.preconnect },
          ),
        ),
      ),
      (request) => Effect.sync(() => request.mockRestore()),
    )
    const global = Global.make({
      home: path.join(root, "home"),
      data: path.join(root, "data"),
      cache: path.join(root, "cache"),
      config: path.join(root, "config"),
      state: path.join(root, "state"),
      tmp: path.join(root, "tmp"),
      bin: path.join(root, "bin"),
      log: path.join(root, "log"),
      repos: path.join(root, "repos"),
    })
    // Windows locates the installer's Git Bash through `git --exec-path`; answer it with a fixture install.
    const git = path.join(root, "Git")
    const bash = process.platform === "win32" ? path.join(git, "bin", "bash.exe") : "bash"
    if (process.platform === "win32") {
      yield* fs.makeDirectory(path.dirname(bash), { recursive: true })
      yield* fs.writeFileString(bash, "bash")
    }
    const commands: string[][] = []
    const updater = yield* Updater.Service.pipe(
      Effect.provide(Updater.layer),
      Effect.provide(
        LayerNode.compile(EffectFlock.node, {
          replacements: [Global.node.replace(Layer.succeed(Global.Service, global))],
        }),
      ),
      Effect.provideService(Global.Service, global),
      Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        remove: (target, options) =>
          failCleanup && target.startsWith(global.cache)
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "remove",
                  pathOrDescriptor: target,
                }),
              )
            : fs.remove(target, options),
        realPath: (input) => (input === execPath ? fs.realPath(executable) : fs.realPath(input)),
      }),
      Effect.provideService(
        AppProcess.Service,
        AppProcess.Service.of({
          ...spawner,
          run: (command) =>
            Effect.suspend(() => {
              if (command._tag !== "StandardCommand") return Effect.die("Unexpected piped install command")
              const lookup = command.command === "git" && command.args[0] === "--exec-path"
              if (!lookup) commands.push([command.command, ...command.args])
              const result = lookup
                ? { stdout: Buffer.from(`${path.join(git, "mingw64", "libexec", "git-core")}\n`) }
                : {
                    ...(command.command === "npm" && command.args[0] === "list"
                      ? { stdout: Buffer.from(JSON.stringify({ dependencies: { "@subicodeagent/subi-cli": { version: "2.0.2" } } })) }
                      : command.command === "subi" ? { stdout: Buffer.from("subi v2.3.4\n") } : {}),
                    ...respond(command),
                  }
              if (result.error) return Effect.fail(result.error)
              return Effect.succeed({
                command: command.command,
                exitCode: 0,
                stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0),
                stdoutTruncated: false,
                stderrTruncated: false,
                ...result,
              })
            }),
          runStream: () => Stream.die("Unexpected streaming install command"),
        }),
      ),
    )
    return { updater, commands, requests, global, fs, executable, bash }
  })
}

for (const method of Updater.methods.filter(method => method !== "npm")) {
  it.live(`${method} cannot dispatch an upstream installer`, () =>
    Effect.gen(function* () {
      const current = yield* fixture()
      const latest = yield* current.updater.latest(method).pipe(Effect.flip)
      expect(latest.message).toContain("npm installations only")
      const install = yield* current.updater.upgrade(method, "2.3.4").pipe(Effect.flip)
      expect(install.message).toContain("npm installations only")
      expect(current.updater.removal(method)).toBeUndefined()
      expect(current.requests).toEqual([])
      expect(current.commands).toEqual([])
    }),
  )
}

it.live("an npm upgrade selects only the SubiCode wrapper and confirms the installed binary", () =>
  Effect.gen(function* () {
    const current = yield* fixture()
    expect(yield* current.updater.latest("npm")).toBe("2.3.4")
    expect(current.requests).toEqual(["https://registry.npmjs.org/@subicodeagent%2fsubi-cli/latest"])
    yield* current.updater.upgrade("npm", "2.3.4")
    expect(current.commands.filter(command => command[1] === "install")).toEqual([[
      "npm", "install", "--global", "--include=optional", "--registry=https://registry.npmjs.org",
      "@subicodeagent/subi-cli@2.3.4",
    ]])
    expect(current.commands.at(-1)).toEqual(["subi", "--version"])
  }),
)

it.live("an upstream installation cannot be replaced by the SubiCode updater", () =>
  Effect.gen(function* () {
    const current = yield* fixture(undefined, "@opencode/cli")
    const result = yield* current.updater.upgrade("npm", "2.3.4").pipe(Effect.flip)
    expect(result.message).toContain("standalone or bundled installation")
    expect(current.commands).toEqual([])
    expect(current.requests).toEqual([])
  }),
)

it.live("registry responses naming another product are rejected before installation", () =>
  Effect.gen(function* () {
    const current = yield* fixture(undefined, undefined, false, "@opencode/cli")
    expect(yield* current.updater.latest("npm").pipe(Effect.flip)).toBeInstanceOf(Error)
    expect(current.commands).toEqual([])
  }),
)

it.live("a successful npm exit cannot hide a stale executable on PATH", () =>
  Effect.gen(function* () {
    const current = yield* fixture(command => command.command === "subi" ? { stdout: Buffer.from("subi v2.0.1") } : {})
    const result = yield* current.updater.upgrade("npm", "2.3.4").pipe(Effect.flip)
    expect(result.message).toContain("version could not be confirmed")
  }),
)
