import { Predicate } from "effect"
import { Icon, type IconProps } from "@opencode/ui/icon"
import { Toast, showToast, type ToastOptions } from "@opencode/ui/toast"
import type { JSX } from "solid-js"

type AppToastOptions = Omit<ToastOptions, "icon"> & {
  icon?: IconProps["name"]
}

export function ToastRegion() {
  return <Toast.Region />
}

function showAppToast(options: AppToastOptions | string) {
  if (Predicate.isString(options)) return showToast(options)

  return showToast({
    ...options,
    icon: resolveIcon(options.icon, options.variant),
    actions: options.actions?.map((action) => ({
      ...action,
      variant: action.onClick === "dismiss" ? "secondary" : "primary",
    })),
  })
}

export { showAppToast as showToast }

function resolveIcon(icon: IconProps["name"] | undefined, variant: ToastOptions["variant"]) {
  const name = icon ?? (variant === "success" ? "check" : undefined)

  if (!name) return undefined

  // SAFETY: Solid resolves child accessor functions under the toast render owner, although JSX.Element omits them.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Solid child accessor bridge; see SAFETY above.
  return (() => <Icon name={name} />) as unknown as JSX.Element
}
