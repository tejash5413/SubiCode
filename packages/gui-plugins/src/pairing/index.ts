import { brandCatalog } from "../branding"
import { Plugin } from "@opencode/plugin/gui"
import en from "./i18n/en"

export default Plugin.define({ i18n: brandCatalog({ en }) })
