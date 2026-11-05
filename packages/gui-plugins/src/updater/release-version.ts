export function releaseVersion(value: string) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/i.exec(value.trim())

  if (!match) return

  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function compareReleaseVersions(
  a: NonNullable<ReturnType<typeof releaseVersion>>,
  b: NonNullable<ReturnType<typeof releaseVersion>>,
) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}
