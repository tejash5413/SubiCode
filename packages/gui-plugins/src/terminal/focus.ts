export const focusTerminalById = (id: string) => {
  const wrapper = document.getElementById(`terminal-wrapper-${id}`)
  const terminal = wrapper?.querySelector('[data-component="terminal"]')

  if (!(terminal instanceof HTMLElement)) return false

  const textarea = terminal.querySelector("textarea")

  if (textarea instanceof HTMLTextAreaElement) {
    textarea.focus({ preventScroll: true })

    return true
  }

  terminal.focus({ preventScroll: true })
  // SAFETY: PointerEvent is an optional browser constructor; this checks host capability before constructing an event.
  terminal.dispatchEvent(
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see SAFETY above
    typeof PointerEvent === "function"
      ? new PointerEvent("pointerdown", { bubbles: true, cancelable: true })
      : new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
  )

  return true
}
