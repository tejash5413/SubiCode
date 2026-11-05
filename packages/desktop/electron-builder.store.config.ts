import type { Configuration } from "electron-builder"
import { getConfig } from "./electron-builder.config"
import { storeIdentity } from "./script/store-identity"

const identity = storeIdentity(process.env)

const base = getConfig()

export default {
  ...base,
  artifactName: identity.draft ? "subi-store-preview-${arch}.${ext}" : "subi-store-${version}-${arch}.${ext}",
  publish: null,
  // Use the current builder toolset for Store packaging.
  toolsets: { ...base.toolsets, winCodeSign: "1.1.0" },
  win: { ...base.win, target: ["appx"] },
  appx: {
    identityName: identity.name,
    publisher: identity.publisher,
    publisherDisplayName: identity.publisherDisplayName,
    applicationId: "SubiCode",
    customManifestPath: "windows/store-appxmanifest.xml",
    displayName: identity.draft ? "SubiCode Store Preview" : "SubiCode",
    backgroundColor: "#394ebe",
    minVersion: "10.0.19041.0",
    setBuildNumber: false,
    addAutoLaunchExtension: false,
    electronUpdaterAware: false,
    languages: ["en-US"],
    capabilities: ["runFullTrust"],
  },
} satisfies Configuration
