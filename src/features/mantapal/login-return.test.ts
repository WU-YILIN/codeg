import { describe, expect, it } from "vitest"
import {
  accountLoginPath,
  authenticatedReturnPath,
  safeSettingsReturnTo,
} from "./login-return"

describe("settings login return path", () => {
  it.each([
    "/settings",
    "/settings/",
    "/settings/appearance",
    "/settings/model-providers?remoteConnectionId=12&remoteWindowId=rw-abc",
  ])("preserves a local settings destination: %s", (path) => {
    expect(safeSettingsReturnTo(path)).toBe(path)
    expect(
      authenticatedReturnPath(
        new URLSearchParams({ returnTo: path }).toString()
      )
    ).toBe(path)
  })

  it.each([
    "https://outside.example/settings",
    "//outside.example/settings",
    "/\\outside.example/settings",
    "/settings\\outside.example",
    "/settings/../workspace",
    "/settings/./appearance",
    "/settings/%2e%2e",
    "/settings/%252e%252e",
    "/settings/%2foutside.example",
    "/settings/appearance/extra",
    "/settings-elsewhere",
    "/workspace",
    "/settings?remoteWindowId=%5cunsafe",
    "/settings?remoteWindowId=%0aunsafe",
    "/settings?remoteWindowId=..",
    "/settings?remoteWindowId=%",
    "/settings#fragment",
  ])("rejects an unsafe or unrelated destination: %s", (path) => {
    expect(safeSettingsReturnTo(path)).toBeNull()
    expect(
      authenticatedReturnPath(
        new URLSearchParams({ returnTo: path }).toString()
      )
    ).toBe("/")
  })

  it("keeps remote connection parameters across the settings login round trip", () => {
    const query = "?remoteConnectionId=24&remoteWindowId=rw-local-24"
    const login = accountLoginPath("/settings/agents", query)
    expect(login).toMatch(/^\/login\?returnTo=/)
    expect(authenticatedReturnPath(login.slice(login.indexOf("?")))).toBe(
      `/settings/agents${query}`
    )
  })

  it("keeps the default workspace login behavior", () => {
    expect(accountLoginPath("/workspace", "?remoteConnectionId=24")).toBe(
      "/login"
    )
    expect(accountLoginPath("/")).toBe("/login")
    expect(authenticatedReturnPath("")).toBe("/")
  })
})
