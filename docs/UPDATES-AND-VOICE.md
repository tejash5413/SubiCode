# SubiCode updates and voice typing

## Desktop updates

The release repository is `https://github.com/tejash5413/SubiCode`.
Direct-download desktop builds check public GitHub release metadata at startup and
every ten minutes while open. A newer stable release is offered only if it contains
a nonempty installer for the running operating system and architecture.

The title bar and a notification show **Update available**. Clicking Download asks
for confirmation and opens that SubiCode release on GitHub. The user chooses the
installer, downloads it, and runs it to update. This path never stages an installer,
silently installs it, or restarts the app. It also works for unsigned manual installs.
The signed in-app installation implementation remains gated off by
`Product.updates.desktop.installInApp`.

Store installations are still serviced by Microsoft Store. They do not run the
GitHub updater. CLI distribution and upgrades continue to use
`@subicodeagent/subi-cli` on npm.

An existing build whose updater was disabled needs one manual installation of the
new build before it can show these notifications. A release must have a higher
version to trigger a notification; replacing files under the same version does not.
Publishing and native-platform qualification are separate release steps.

## Editable voice input

- Desktop/web: click the microphone beside the composer actions.
- CLI: run `/voice` in an empty prompt, or choose Voice typing in the command palette.
  The CLI opens a local browser window for microphone access.
- Start recording, speak for up to 90 seconds, and stop. Review and edit the transcript,
  then choose Use text. The transcript is inserted into the current draft; sending
  the AI message is a separate user action.
- Cancel or close the panel to stop recording and discard pending results.

Speech recognition uses Whisper tiny through Transformers.js in a local WebAssembly
worker. First use downloads the library's speech model/runtime assets; model files
are cached by the browser when available. Recording audio is not uploaded to
LearnSmart, GitHub, Hugging Face, OpenRouter, or an AI provider. The CLI loopback
bridge receives only the transcript the user reviewed.

The bridge listens only on `127.0.0.1`, requires a per-recording token and matching
Origin for completion/cancellation, rejects oversized transcripts, expires sessions,
and discards late results after cancellation. The CLI reuses one browser origin
during its lifetime so voice sessions can reuse the browser cache.

Transcription does not call paid inference APIs or deduct LearnSmart credits.
Sending the resulting text to an AI model still uses the normal free/paid model
rules. Recognition accuracy depends on the recording and language, so the transcript
is always editable. CLI voice requires a local browser and microphone.

Windows browser transcription, terminal draft insertion, cancellation and loopback
request validation have been tested locally. The packaged Windows desktop passed
update confirmation, explicit GitHub opening, local speech recognition and editable
draft insertion. The native speech test used authentic model files cached during the
successful browser test because the model host subsequently failed DNS resolution
on this computer. First-use downloading therefore still requires a working connection
to the model host. macOS/Linux source and cross-build checks do not replace native
microphone and installer qualification on those systems.
