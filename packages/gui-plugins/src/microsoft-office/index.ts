import { brandCatalog } from "../branding"
import { Plugin } from "@opencode/plugin/gui"
import en from "./i18n/en"

/** Read-only previews of Word, Excel and PowerPoint files in the file view. */
export default Plugin.define({
  i18n: brandCatalog({ en }),
})
