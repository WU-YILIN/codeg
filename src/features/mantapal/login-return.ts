/** Only settings windows may resume a page after account authentication. */
export function safeSettingsReturnTo(candidate: string | null): string | null {
  if (!candidate || candidate.length > 2048) return null
  const pathname = candidate.split("?")[0]
  if (!/^\/settings(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?\/?$/.test(pathname))
    return null
  try {
    const decoded = decodeURIComponent(candidate)
    if (/[\\#\u0000-\u0020\u007f]/.test(decoded) || decoded.includes(".."))
      return null
  } catch {
    return null
  }
  return candidate
}

export function accountLoginPath(pathname: string, search = ""): string {
  const returnTo = safeSettingsReturnTo(`${pathname}${search}`)
  return returnTo ? `/login?${new URLSearchParams({ returnTo })}` : "/login"
}

export function authenticatedReturnPath(search: string): string {
  return (
    safeSettingsReturnTo(new URLSearchParams(search).get("returnTo")) || "/"
  )
}
