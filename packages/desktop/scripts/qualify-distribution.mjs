import { execFileSync, spawn } from "node:child_process"
import { createRequire } from "node:module"
import { access, mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import net from "node:net"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { windowsCliScript } from "./vscode-cli.mjs"

// Execute the packaged products in disposable profiles, never the developer's accounts.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

const output = path.resolve(process.argv[2])

const require = createRequire(path.join(root, "packages/app/package.json"))

const { _electron, expect } = require("@playwright/test")

const vscode = createRequire(path.join(root, "sdks/vscode/package.json"))("@vscode/test-electron")

const fixture = await mkdtemp(path.join(tmpdir(), "subicode-native-"))

const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !/^(OPENCODE_|SUBI_|ELECTRON_RUN_AS_NODE|NODE_OPTIONS)/.test(key) &&
      !/(API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS)/i.test(key),
  ),
)

Object.assign(env, {
  HOME: fixture,
  USERPROFILE: fixture,
  APPDATA: path.join(fixture, "appdata"),
  LOCALAPPDATA: path.join(fixture, "localappdata"),
  XDG_CONFIG_HOME: path.join(fixture, "config"),
  XDG_DATA_HOME: path.join(fixture, "data"),
  XDG_CACHE_HOME: path.join(fixture, "cache"),
  TEMP: path.join(fixture, "temp"),
  TMP: path.join(fixture, "temp"),
  TMPDIR: path.join(fixture, "temp"),
  OPENCODE_TEST_HOME: fixture,
  OPENCODE_TEST_ONBOARDING: "1",
  OPENCODE_CONFIG_DIR: path.join(fixture, "cli-config"),
  OPENCODE_CONFIG_CONTENT: "{}",
  OPENCODE_CLI_CONFIG_CONTENT: "{}",
  OPENCODE_DISABLE_MODELS_FETCH: "true",
  VSCODE_IPC_HOOK_CLI: "",
  VSCODE_CLI: "",
})

await mkdir(env.OPENCODE_CONFIG_DIR, { recursive: true })

await mkdir(env.TEMP, { recursive: true })

const servicePort = await new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port
    server.close(() => resolve(port))
  })
})

await writeFile(path.join(env.OPENCODE_CONFIG_DIR, "service.json"), JSON.stringify({ port: servicePort }))

const qualificationFile = path.join(output, "packages/qualification.json")

const result = JSON.parse(await readFile(qualificationFile, "utf8"))

delete result.failure
result.desktopExecution = "pending"
delete result.desktopWindowTitle
delete result.desktopBranding
delete result.mcpUrlConnection

const platform = `${process.platform}-${process.arch}`

const desktopId = `in.stlearnsmart.subi.desktop${result.channel === "prod" ? "" : ".dev"}`

const cli = path.join(output, "packages/cli/bin", process.platform === "win32" ? "subi.exe" : "subi")

const desktop = path.join(
  output,
  "desktop",
  ...new Map([
    ["win32", [process.arch === "arm64" ? "win-arm64-unpacked" : "win-unpacked", "SubiCode.exe"]],
    ["darwin", [process.arch === "arm64" ? "mac-arm64" : "mac", "SubiCode.app/Contents/MacOS/SubiCode"]],
    ["linux", [process.arch === "arm64" ? "linux-arm64-unpacked" : "linux-unpacked", desktopId.replace(/\.desktop$/, "")]],
  ]).get(process.platform),
)

async function run(command, args, extraEnv = env) {
  const child = spawn(command, args, { env: extraEnv, stdio: "inherit", windowsHide: true })
  await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))))
  })
}

let app

async function closeDesktop() {
  const application = app
  app = undefined

  if (!application) return
  console.log("Qualification: closing the disposable desktop and stopping its service")
  const registrations = (await readdir(fixture, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name === "service.json")
    .map(entry => path.join(entry.parentPath, entry.name))
  const registration = (await Promise.all(registrations.map(async file => {
    const record = JSON.parse(await readFile(file, "utf8"))
    return record.url && new URL(record.url).port === String(servicePort) ? file : undefined
  }))).find(Boolean)
  if (!registration) throw new Error("Disposable desktop service registration not found")
  // The service can hold inherited stdio open on POSIX. Stop it while Playwright
  // closes Electron rather than waiting for process exit before stopping it.
  // Onboarding and the login shell can change XDG roots; the matching port proves
  // which registration belongs to this run. Never guess its state directory.
  await Promise.all([
    application.close(),
    run(cli, ["service", "stop"], { ...env, XDG_STATE_HOME: path.dirname(path.dirname(registration)) }),
  ])
}

try {
  console.log(`Qualification: launching ${platform} desktop`)
  await access(desktop)
  app = await _electron.launch({
    executablePath: desktop,
    env,
    args: ["--no-sandbox", `--user-data-dir=${path.join(fixture, "desktop-user")}`],
    timeout: 60000,
  })
  const page = await app.firstWindow()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.locator('[data-component="composer"]').waitFor({ timeout: 60000 })
  await expect(page).toHaveTitle("SubiCode")
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.getTitle()))).toEqual(["SubiCode"])
  const updaterConfig = await readFile(path.join(path.dirname(desktop), "resources/app-update.yml"), "utf8").catch(() => "")
  result.desktopWindowTitle = "passed: HTML title and native taskbar/window title identify SubiCode"
  console.log("Qualification: desktop composer is ready")
  const expiredPairing = await fetch(`http://127.0.0.1:${servicePort}/auth/connect/qualification-expired`, {
    headers: { accept: "text/html" },
  })
  expect(expiredPairing.status).toBe(401)
  expect(await expiredPairing.text()).toBe(
    "This pairing link expired or was already used. Run `subi pair` to get a new one.",
  )
  result.desktopRecovery = "passed: bundled server pairing recovery uses the subi command"
  // Enter a draft explicitly; the home screen can replace the startup draft while projects finish loading.
  await page.locator(".subi-new-task").click()
  await expect(page.locator('[data-component="new-session"]')).toBeVisible()
  await expect(page.locator(".subi-workspace-sidebar")).toBeVisible()
  await expect(page.getByRole("heading", { name: "What are we building?", exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(output, "subicode-welcome-ui.png") })
  const mode = page.getByRole("button", { name: "Choose agent", exact: true })
  await expect(mode).toBeVisible()
  await mode.click()
  // Keyboard activation avoids waiting for the animated popup's pointer geometry on CI.
  await page.getByRole("menuitemradio", { name: "plan", exact: true }).press("Enter")
  await expect(mode).toHaveText("plan")
  await mode.click()
  await page.getByRole("menuitemradio", { name: "build", exact: true }).press("Enter")
  await expect(mode).toHaveText("build")
  await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,")
  const settings = page.getByTestId("settings-screen")

  for (const name of [
    "Preferences",
    "Appearance",
    "Notifications",
    "Shortcuts",
    "Pairing",
    "Projects",
    "Worktrees",
    "Providers",
    "Models",
    "Extensions",
    "Server",
    "About",
  ]) {
    await settings.getByRole("tab", { name, exact: true }).click()
    await expect(settings.locator(".settings-breadcrumb")).toContainText(name)
    await expect(settings).not.toContainText(/opencode/i)
    await expect(page).toHaveTitle("SubiCode")
    if (name === "Preferences" && result.desktopUpdateDelivery === "manual-github") {
      await expect(settings.locator('[data-action="settings-check-updates"]')).toBeEnabled({ timeout: 30000 })
      await expect(settings).toContainText("Check SubiCode releases on GitHub")
      await expect(settings.getByRole("button", { name: "Install and restart", exact: true })).toHaveCount(0)
      result.manualUpdatePolicy = "passed: GitHub metadata check and manual download UI; no install/restart action"
    }
    if (name === "Preferences" && result.desktopUpdateDelivery !== "manual-github" && process.platform === "win32" && !/^publisherName:/m.test(updaterConfig)) {
      await expect(settings.locator('[data-action="settings-check-updates"]')).toBeDisabled()
      result.unsignedUpdatePolicy = "passed: automatic update action disabled without a Windows publisher identity"
    }
  }

  await settings.getByRole("tab", { name: "Extensions", exact: true }).click()
  await settings.getByRole("button", { name: "Add MCP connection", exact: true }).click()
  const form = page.getByRole("dialog", { name: "Add MCP connection", exact: true })
  await expect(form.getByLabel("App name", { exact: true })).toBeVisible()
  await expect(form.getByLabel("MCP server URL", { exact: true })).toBeVisible()
  await expect(form.getByRole("button", { name: "Save and connect", exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(output, "subicode-mcp-url-ui.png") })
  await expect(form).not.toContainText(/opencode/i)
  let initialized = 0
  const mcpEndpoint = createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405)
      return response.end()
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (message.id === undefined) {
      response.writeHead(202)
      return response.end()
    }
    if (message.method === "initialize") initialized++
    const result = message.method === "initialize"
      ? { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "Qualification Docs", version: "1" } }
      : message.method === "tools/list" ? { tools: [] } : {}
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }))
  })
  await new Promise(resolve => mcpEndpoint.listen(0, "127.0.0.1", resolve))
  try {
    await form.getByLabel("App name", { exact: true }).fill("Qualification Docs")
    await form.getByLabel("MCP server URL", { exact: true }).fill(`http://127.0.0.1:${mcpEndpoint.address().port}/mcp`)
    await form.getByRole("button", { name: "Save and connect", exact: true }).click()
    await expect(form).toBeHidden()
    await expect(settings.getByText("Qualification Docs", { exact: true })).toBeVisible()
    await expect(settings.getByRole("status").filter({ hasText: /^Connected$/ })).toBeVisible({ timeout: 30000 })
    expect(initialized).toBeGreaterThan(0)
    await page.screenshot({ path: path.join(output, "subicode-mcp-connected-ui.png") })
    await settings.getByRole("button", { name: "Remove", exact: true }).click()
    await expect(settings.getByText("Qualification Docs", { exact: true })).toHaveCount(0)
    result.mcpUrlConnection = "passed: URL entry, Save and connect, MCP initialization, connected status and removal against an isolated local server"
  } finally {
    mcpEndpoint.closeAllConnections()
    await new Promise(resolve => mcpEndpoint.close(resolve))
  }
  const pluginFolder = path.join(fixture, "fixture-plugin")
  const skillFolder = path.join(fixture, "fixture-skills")
  await mkdir(pluginFolder)
  await mkdir(skillFolder)
  await writeFile(path.join(pluginFolder, "package.json"), '{"type":"module"}')
  await writeFile(
    path.join(pluginFolder, "index.js"),
    'export default { id: "native-setup-fixture", async setup() {} }',
  )
  await writeFile(
    path.join(skillFolder, "SKILL.md"),
    "---\nname: native-setup-fixture\ndescription: Native setup fixture\n---\nLocal skill.",
  )
  for (const kind of ["plugin", "skill"]) {
    await settings.getByRole("tab", { name: kind === "plugin" ? "Plugins" : "Skills", exact: true }).click()
    await settings.getByRole("button", { name: `Add ${kind}`, exact: true }).click()
    const source = page.getByRole("dialog", { name: `Add ${kind}`, exact: true })
    await source
      .getByLabel(kind === "plugin" ? "Package or local path" : "Folder on this server", { exact: true })
      .fill(kind === "plugin" ? pluginFolder : skillFolder)
    await source.getByRole("button", { name: "Save and load", exact: true }).click()
    await expect(source).toBeHidden()
    await expect(settings.getByText("native-setup-fixture", { exact: true })).toBeVisible()
    await expect(settings).not.toContainText(/opencode/i)
    await settings.getByRole("button", { name: "Remove source", exact: true }).click()
    await expect(settings.getByText("native-setup-fixture", { exact: true })).toHaveCount(0)
  }
  await page.screenshot({ path: path.join(output, "desktop-qualification.png") })
  // Reproduce the taskbar caption with a named session without making any model request.
  const greeting = await page.evaluate(async ({ url, directory }) => {
    const response = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Greeting", location: { directory } }),
    })
    if (!response.ok) throw new Error(`Fixture session creation failed: ${response.status}`)
    return response.json()
  }, { url: `http://127.0.0.1:${servicePort}`, directory: fixture })
  expect(greeting.data.title).toBe("Greeting")
  await settings.getByRole("button", { name: "Back to app", exact: true }).click()
  await page.locator(".subi-workspace-nav").getByRole("button", { name: "Recent tasks", exact: true }).click()
  await page.getByText("Greeting", { exact: true }).first().click()
  await expect(page).toHaveTitle("Greeting · SubiCode")
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.getTitle()))).toEqual(["Greeting · SubiCode"])
  await page.screenshot({ path: path.join(output, "subicode-greeting-caption.png") })
  result.desktopSessionWindowTitle = "passed: Greeting · SubiCode in HTML and native Windows taskbar/window title"
  console.log("Qualification: named session native caption passed")
  console.log("Qualification: desktop UI checks completed")

  if (errors.length) throw new Error(errors.join("\n"))
  result.desktopExecution =
    "passed: packaged startup, Build/Plan, all Settings sections, MCP form, local plugin and skill setup/removal"
  result.desktopBranding = "passed: no OpenCode text in twelve Settings sections or extension setup forms"
  // Read after startup: loading the user's shell environment can change the XDG
  // paths after the early window exists. Stop only this disposable profile's service.
  Object.assign(
    env,
    await app.evaluate(() => ({
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
      XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    })),
  )
  await closeDesktop()
  if (process.argv.includes("--desktop-only")) {
    await writeFile(qualificationFile, JSON.stringify(result, null, 2) + "\n")
    console.log("Qualification: desktop-only checks completed; extension execution remains pending")
  } else {
  console.log("Qualification: installing and checking the VS Code extension")
  // Optional existing host avoids a large editor download for offline/local qualification.
  const downloadedCode = process.argv[3] ?? (await vscode.downloadAndUnzipVSCode("stable"))
  // Recent VS Code macOS bundles changed their executable name. Read the bundle's
  // declared entrypoint instead of relying on test-electron's historical name.
  const code = process.platform === "darwin"
    ? path.join(path.dirname(downloadedCode), execFileSync("/usr/libexec/PlistBuddy", [
      "-c", "Print :CFBundleExecutable", path.resolve(path.dirname(downloadedCode), "../Info.plist"),
    ], { encoding: "utf8" }).trim())
    : downloadedCode
  await access(code)
  const cliPath = vscode.resolveCliPathFromVSCodeExecutablePath(code)

  const args = [
    "--user-data-dir",
    path.join(fixture, "vscode-user"),
    "--extensions-dir",
    path.join(fixture, "extensions"),
  ]

  await run(
    process.platform === "win32" ? code : cliPath,
    [
      ...(process.platform === "win32" ? [process.argv[4] ?? (await windowsCliScript(cliPath))] : []),
      ...args,
      "--install-extension",
      path.join(output, `subicode-${platform}.vsix`),
      "--force",
    ],
    {
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  )
  const extensionDirectory = path.join(fixture, "extensions")
  const installedExtension = (await readdir(extensionDirectory, { withFileTypes: true })).find(entry =>
    entry.isDirectory() && entry.name.startsWith(`learnsmart.subicode-${result.extensionVersion}`),
  )
  if (!installedExtension) throw new Error("Installed SubiCode VSIX was not found")
  const extensionPath = path.join(extensionDirectory, installedExtension.name)
  const extensionBinary = path.join(extensionPath, "bin", platform, process.platform === "win32" ? "subi.exe" : "subi")
  console.log(`Qualification: installed extension binary mode ${((await stat(extensionBinary)).mode & 0o777).toString(8)}`)
  const workspace = path.join(fixture, "workspace")
  const vscodeLogs = path.join(output, "vscode-logs")
  await mkdir(workspace)
  await mkdir(vscodeLogs, { recursive: true })
  // Actions owns the host-wide deadline. Preserve completed checks and an explicit
  // failure if that deadline stops VS Code before the runner can report a result.
  delete result.extensionExecution
  result.failure = "VS Code extension host qualification did not complete"
  await writeFile(qualificationFile, JSON.stringify({ ...result, fixture }, null, 2) + "\n")
  await vscode.runTests({
    vscodeExecutablePath: code,
    extensionDevelopmentPath:
      process.platform === "win32"
        ? `"${extensionPath}"`
        : extensionPath,
    extensionTestsPath:
      process.platform === "win32"
        ? `"${path.join(root, "sdks/vscode/out/test/runner.js")}"`
        : path.join(root, "sdks/vscode/out/test/runner.js"),
    extensionTestsEnv: env,
    launchArgs: [
      ...args,
      "--log",
      "trace",
      "--logsPath",
      vscodeLogs,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-extensions",
      "--skip-welcome",
      "--disable-workspace-trust",
      workspace,
    ].map((arg) => (process.platform === "win32" && arg.includes(" ") ? `"${arg}"` : arg)),
  })
  delete result.failure
  result.extensionExecution = "passed: packaged VSIX installation, bundled CLI startup and terminal reuse"
  }
} catch (error) {
  result.failure = String(error)
  throw error
} finally {
  await closeDesktop()
  await run(cli, ["service", "stop"], { ...env, XDG_STATE_HOME: path.join(fixture, ".local/state") }).catch((error) =>
    console.error(error.message),
  )
  await writeFile(qualificationFile, JSON.stringify({ ...result, fixture }, null, 2) + "\n")
}
