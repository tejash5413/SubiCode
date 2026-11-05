# SubiCode 2.0.2 integration

## Requested outcome

Bring the OpenCode 2.2.0 and 2.2.1 feature set into SubiCode while retaining
LearnSmart authentication, individual credit accounting, school token policy,
free-model rules, the Silver CLI workspace and sidebar, and SubiCode-only updates.
The Windows and macOS desktop retain the SubiCode 2.0.1 appearance and MCP management screens. New provider/plugin APIs and 2.0.2 features are integrated underneath the existing layout.
Public SubiCode version: 2.0.2. Do not overwrite or republish 2.0.1 artifacts.

## Implementation sequence

1. Work in the isolated `codex/subicode-202` checkout. Preserve the original
   checkout, uncommitted updater configuration and all existing release evidence.
2. Reconcile the original upstream snapshot with local OpenCode 2.2.1 and the
   SubiCode changes. Carry forward goals, schedules, image/decision APIs, image
   tools, desktop GUI plugins, model picker, background shell inspection and fixes.
3. Adapt LearnSmart and custom UI to changed public APIs. Keep privileged backend
   billing authoritative; do not turn hosted OpenCode free access back on.
4. Set public CLI, desktop, extension and release-tool defaults to 2.0.2. Keep
   internal dependency versions consistent with their upgraded source and lockfile.
5. Preserve our public GitHub desktop and npm CLI feeds. Finish update metadata
   staging, architecture-aware merging and publication preflight. Do not publish.
6. Generate protocol clients, install supported dependencies, run canonical checks
   and focused regression tests, then build and inspect available native artifacts.
7. Record precise results and remaining signing/native/live-provider limitations.
   Do not advertise unqualified platforms or infer live account success from mocks.

## Feature policy

- Goals are explicit user-started tasks with pause/resume/clear and review limits.
- Schedules, image generation, media features and experimental GUI plugins retain
  explicit opt-in controls and provider eligibility checks.
- LearnSmart credentials, models, balances, permissions and charging stay managed
  by LearnSmart; no provider keys are exposed in generated artifacts.
- No imported upstream publication/deployment workflow becomes active.
- No running user app or background server is restarted by this integration.
- Signing identities are not yet available. A signed-upgrade claim requires real
  Windows signature/macOS notarization checks and an installed-app upgrade test.

## Desktop UI preservation and manual build

The desktop keeps SubiCode's 2.0.1 workspace navigation, welcome heading,
three task suggestions, LearnSmart account entry, composer shortcuts and
settings styling. The `workspace` layout remains the default and persisted
2.0.1 workspace preferences are retained rather than converted to upstream tabs.
The upgraded location dialog and plugin contracts remain behind those controls.
The Windows and macOS renderers share this implementation; this Windows host
has not executed a native macOS desktop build.

MCP uses the original single URL connection screen: Add MCP connection,
HTTP/HTTPS URL validation, Save and connect, automatic OAuth when required,
and reconnect/disconnect/edit/remove controls. The duplicate imported MCP list
was removed. No provider credentials or real user MCP configuration were used
for qualification.

Validated on the current UI sources:

- 927 app unit tests passed.
- 22 core MCP OAuth tests and four CLI MCP URL/auth tests passed.
- 12 desktop distribution/identity tests passed.
- Official app TypeScript check and browser-test TypeScript check passed.
- Strict GUI lint passed across 1,801 changed files with zero diagnostics.
- Native packaged Windows x64 desktop passed Build/Plan selection, all twelve
  settings sections, SubiCode branding, local plugin/skill setup/removal, and
  real MCP initialization over a loopback HTTP URL followed by removal.
- Screenshots and the qualification record are in
  `artifacts/upgrade-202/native-ui-review/`.

The earlier default-config packaging attempt was quarantined in
`artifacts/upgrade-202/rejected-default-config/`. It is not an install candidate.
The current Windows application identifies itself as SubiCode 2.0.2 and uses
only the tejash5413/SubiCode GitHub update feed. It remains unsigned.
These UI checks do not qualify macOS/Linux native execution or the complete
2.0.2 release. All six final CLI targets were cross-compiled and staged as 2.0.2, and a clean
Windows x64 npm installation passed. Other-platform native execution, signing
and installed-app update qualification remain separate release work. Nothing
has been published or installed over the existing 2.0.1 release.

Window caption follow-up: the main and session `<Title>` values now use
`Product.name`. A production browser regression passed for switching session
names and returning home. Native Windows qualification checks both the HTML
title and `BrowserWindow.getTitle()` and passed with the final bundled CLI.
The development-server attempt hit the Vite dependency-scanner JSX error; the
production-build run is the passing browser evidence. Local final Windows UI
review artifacts are in `artifacts/SubiCode-2.0.2-Windows/`.

## Independent integration review follow-up

The read-only review identified two updater issues; MCP, workspace retention,
shared feature registration and shell inspection had no additional concrete
finding within the reviewed scope. Live provider billing and other-platform
native execution were not part of that review.

- Windows updater initialization now reads electron-builder's publisher identity
  from app-update.yml. A missing, empty or invalid publisher disables automatic
  updates and the update menu action. Signed builds must supply this identity;
  an installed signed upgrade/wrong-publisher rejection test remains required.
- Ruling: Windows x64/ARM64 must be published together, as must macOS x64/ARM64.
  They share immutable feed filenames. Publication preparation now rejects an
  incomplete pair before uploading anything, so a later architecture cannot
  require rewriting an already-public feed. Linux feeds remain independent.
  Cost: a Windows/macOS release waits for both architectures' native checks.
