import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
import SettingsPage from "./page"

beforeEach(() => router.replace.mockClear())
afterEach(() => window.history.replaceState(null, "", "/"))

describe("default settings destination", () => {
  it("keeps the remote connection when opening the default settings page", () => {
    const search = "?remoteConnectionId=18&remoteWindowId=rw-18"
    window.history.replaceState(null, "", `/settings${search}`)
    render(<SettingsPage />)
    expect(router.replace).toHaveBeenCalledWith(`/settings/appearance${search}`)
  })

  it("preserves the usual appearance destination without remote parameters", () => {
    window.history.replaceState(null, "", "/settings")
    render(<SettingsPage />)
    expect(router.replace).toHaveBeenCalledWith("/settings/appearance")
  })
})
