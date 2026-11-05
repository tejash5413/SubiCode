import { expect, test } from "bun:test"
import { storeIdentity } from "./store-identity"

test("Store submission requires complete product identity, while local previews remain explicit", () => {
  for (const env of [
    {},
    { SUBICODE_STORE_IDENTITY_NAME: "12345.LearnSmartSubiCode" },
    { SUBICODE_STORE_IDENTITY_NAME: "12345.LearnSmartSubiCode", SUBICODE_STORE_PUBLISHER: "CN=store-id" },
    { SUBICODE_STORE_IDENTITY_NAME: "invalid/name", SUBICODE_STORE_PUBLISHER: "CN=store-id", SUBICODE_STORE_PUBLISHER_DISPLAY_NAME: "LearnSmart" },
    { SUBICODE_STORE_IDENTITY_NAME: "Local.SubiCode.Preview", SUBICODE_STORE_PUBLISHER: "CN=SubiCode Local Preview", SUBICODE_STORE_PUBLISHER_DISPLAY_NAME: "LearnSmart" },
  ]) expect(() => storeIdentity(env)).toThrow()

  expect(storeIdentity({ SUBICODE_STORE_DRAFT: "1" })).toEqual({
    draft: true, name: "Local.SubiCode.Preview", publisher: "CN=SubiCode Local Preview", publisherDisplayName: "SubiCode Local Preview",
  })
  expect(storeIdentity({
    SUBICODE_STORE_IDENTITY_NAME: "12345.LearnSmartSubiCode", SUBICODE_STORE_PUBLISHER: "CN=store-id", SUBICODE_STORE_PUBLISHER_DISPLAY_NAME: "LearnSmart",
  })).toEqual({ draft: false, name: "12345.LearnSmartSubiCode", publisher: "CN=store-id", publisherDisplayName: "LearnSmart" })
  expect(storeIdentity({
    SUBICODE_STORE_IDENTITY_NAME: "12345.LearnSmartSubiCode", SUBICODE_STORE_PUBLISHER: "CN=A&B", SUBICODE_STORE_PUBLISHER_DISPLAY_NAME: "A&B's Software",
  })).toEqual({ draft: false, name: "12345.LearnSmartSubiCode", publisher: "CN=A&amp;B", publisherDisplayName: "A&amp;B&apos;s Software" })
})
