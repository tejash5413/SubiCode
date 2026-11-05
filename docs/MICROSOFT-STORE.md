# SubiCode Microsoft Store preparation

The Windows x64 local preview is artifacts/store-preview/subi-store-preview-x64.appx.
It uses Local.SubiCode.Preview and is unsigned. It must be rebuilt with Microsoft's
assigned identity before submission. Other architectures and Store certification
are pending. Package validation is recorded in artifacts/store-preview/validation.json.

The separate electron-builder.store.config.ts packages AppX, which is accepted by
Microsoft Store alongside MSIX. It preserves SubiCode assets, full-trust desktop
execution and the subi: callback protocol. Windows handles Store updates. The
updater returns disabled in Store processes before configuring the GitHub updater.

Required account work

1. Register at https://storedeveloper.microsoft.com/ using the actual publisher's
   Individual or Company account. The account holder completes identity checks
   and the developer agreement.
2. Reserve SubiCode in Partner Center as a Windows app.
3. Open Product management > Product identity and copy the three public fields
   Package/Identity/Name, Package/Identity/Publisher, and
   Package/Properties/PublisherDisplayName.
4. Set SUBICODE_STORE_IDENTITY_NAME, SUBICODE_STORE_PUBLISHER, and
   SUBICODE_STORE_PUBLISHER_DISPLAY_NAME to those exact values. Remove
   SUBICODE_STORE_DRAFT before producing the submission build. Missing values or
   the local-preview identity are rejected outside draft mode.

Build from packages/desktop with OPENCODE_CHANNEL=prod, OPENCODE_VERSION=2.0.2
and OPENCODE_TARGET=windows-x64 after the matching CLI and desktop build exist.

    node node_modules/electron-builder/cli.js --config electron-builder.store.config.ts --win appx --x64 --publish never

On this PC the bundled MakeAppx tool failed to resolve its side-by-side assembly.
The Microsoft.Windows.SDK.BuildTools NuGet SDK 10.0.28000.2957 was extracted only
inside artifacts/store-sdk. Set ELECTRON_BUILDER_WINDOWS_KITS_PATH to its
bin/10.0.28000.0/x64 folder to use that Microsoft SDK. This produced the preview.

Validation completed

- Desktop/GUI type checks and the desktop production build passed.
- Store identity table and existing distribution contracts passed, 5 tests.
- Store updater guard test passed.
- Microsoft MakeAppx schema validation and preview package creation passed.
- Windows development registration of the preview succeeded. Its temporary
  registration was removed after testing.
- Package payload, logo and manifest integrity checks are in validation.json.

Remaining verification

The package-context debugger could not launch a test process using
Invoke-CommandInDesktopPackage. Direct launch proved a normal packaged Electron
startup but did not carry Store identity, so it is not Store runtime evidence.
Store terminal, file access, LearnSmart login, MCP OAuth and Store-delivered update
qualification remain pending. Do not mark the Store submission production-ready.

After the real identity is assigned, complete local Store runtime tests, the
Windows App Certification Kit checks, listing screenshots/privacy details and
certification notes. Explain runFullTrust as required by a developer tool that
runs user-authorized shell commands and edits user-selected project files.
Microsoft supplies the public signature only after Store certification.

Official references

- https://learn.microsoft.com/en-us/windows/apps/publish/view-app-identity-details
- https://learn.microsoft.com/en-us/windows/apps/publish/get-started
- https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-debug

No Store submission or publication has been performed.
