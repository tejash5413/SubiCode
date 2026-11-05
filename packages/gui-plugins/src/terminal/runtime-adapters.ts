import { Predicate } from "effect"

export const disposeIfDisposable = <T>(value: T) => {
  if (!Predicate.isObject(value) || !Predicate.isFunction(value.dispose)) return

  value.dispose()
}

export const setOptionIfSupported = <T, Next>(value: T, key: string, next: Next) => {
  if (!Predicate.isObject(value) || !Predicate.isFunction(value.setOption)) return

  value.setOption(key, next)
}

export const getHoveredLinkText = <T>(value: T) => {
  if (!Predicate.isObject(value)) return

  const link = value.currentHoveredLink

  if (!Predicate.isObject(link) || !Predicate.isString(link.text)) return

  return link.text
}
