export function storeIdentity(env: NodeJS.ProcessEnv) {
  if (env.SUBICODE_STORE_DRAFT === "1")
    return {
      draft: true,
      name: "Local.SubiCode.Preview",
      publisher: "CN=SubiCode Local Preview",
      publisherDisplayName: "SubiCode Local Preview",
    }

  const name = env.SUBICODE_STORE_IDENTITY_NAME?.trim()
  const publisher = env.SUBICODE_STORE_PUBLISHER?.trim()
  const publisherDisplayName = env.SUBICODE_STORE_PUBLISHER_DISPLAY_NAME?.trim()

  if (!name || !publisher || !publisherDisplayName)
    throw new Error("Store submission requires the three product identity values from Microsoft Partner Center. Use SUBICODE_STORE_DRAFT=1 only for a local preview.")

  if (!/^[a-zA-Z0-9.-]{3,50}$/.test(name) || !/^CN=.+$/.test(publisher) || /[\r\n]/.test(publisher + publisherDisplayName))
    throw new Error("Invalid Store product identity. Copy the exact Name, Publisher and PublisherDisplayName from Partner Center.")

  if (name === "Local.SubiCode.Preview" || publisher === "CN=SubiCode Local Preview")
    throw new Error("The local preview identity cannot be used for a Store submission.")

  // electron-builder v26 interpolates these strings directly into AppxManifest.xml.
  const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;")

  return { draft: false, name, publisher: xml(publisher), publisherDisplayName: xml(publisherDisplayName) }
}
