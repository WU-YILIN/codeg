import { useEffect, type ReactNode } from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MantapalAccount } from "@/features/mantapal/contract"

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  replace: vi.fn(),
  remoteMount: vi.fn(),
  loadSettings: vi.fn(),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock("@/features/mantapal/account-client", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/mantapal/account-client")
  >()),
  createAccountClient: () => ({ session: mocks.session }),
}))
vi.mock("@/features/mantapal/brand", () => ({
  BrandSplash: () => <div role="status">正在恢复账户</div>,
}))
vi.mock("@/contexts/remote-connection-context", () => ({
  RemoteConnectionGate: ({ children }: { children: ReactNode }) => {
    mocks.remoteMount()
    return children
  },
}))
vi.mock("@/components/providers/update-provider", () => ({
  UpdateProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock("@/components/settings/settings-shell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => (
    <section aria-label="原设置窗口">{children}</section>
  ),
}))

import { MantapalAccountProvider } from "@/features/mantapal/account-provider"
import SettingsLayout from "./layout"

const account: MantapalAccount = {
  id: "account-one",
  name: "Levi",
  phoneMasked: "138 **** 8000",
  tier: "free",
  firstUse: false,
  wechatBound: false,
}
function SettingsContent() {
  useEffect(() => {
    mocks.loadSettings()
  }, [])
  return <div>模型配置</div>
}
function renderSettings() {
  return render(
    <MantapalAccountProvider>
      <SettingsLayout>
        <SettingsContent />
      </SettingsLayout>
    </MantapalAccountProvider>
  )
}
async function settleStartup() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  window.history.replaceState(null, "", "/")
  mocks.session.mockResolvedValue({ account: null, csrfToken: "csrf" })
})
afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, "", "/")
})

describe("settings account boundary", () => {
  it("waits for the account before mounting the settings or remote connection", async () => {
    mocks.session.mockReturnValue(new Promise(() => {}))
    renderSettings()
    await settleStartup()
    expect(screen.getByRole("status")).toHaveTextContent("正在恢复账户")
    expect(mocks.remoteMount).not.toHaveBeenCalled()
    expect(mocks.loadSettings).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it.each([
    ["signed out", null],
    ["first-use onboarding incomplete", { ...account, firstUse: true }],
  ])("redirects %s without running settings effects", async (_, value) => {
    mocks.session.mockResolvedValue({ account: value, csrfToken: "csrf" })
    renderSettings()
    await settleStartup()
    expect(mocks.replace).toHaveBeenCalledWith("/login")
    expect(mocks.remoteMount).not.toHaveBeenCalled()
    expect(mocks.loadSettings).not.toHaveBeenCalled()
    expect(screen.queryByText("模型配置")).not.toBeInTheDocument()
  })

  it("retains the existing settings and remote connection for a signed-in account", async () => {
    mocks.session.mockResolvedValue({ account, csrfToken: "csrf" })
    renderSettings()
    await settleStartup()
    expect(screen.getByRole("region", { name: "原设置窗口" })).toBeVisible()
    expect(screen.getByText("模型配置")).toBeVisible()
    expect(mocks.remoteMount).toHaveBeenCalled()
    expect(mocks.loadSettings).toHaveBeenCalledOnce()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it.each([null, { ...account, firstUse: true }])(
    "preserves the settings destination for login or unfinished onboarding",
    async (value) => {
      const returnTo =
        "/settings/agents?remoteConnectionId=9&remoteWindowId=rw-9"
      window.history.replaceState(null, "", returnTo)
      mocks.session.mockResolvedValue({ account: value, csrfToken: "csrf" })
      renderSettings()
      await settleStartup()
      expect(mocks.replace).toHaveBeenCalledWith(
        `/login?${new URLSearchParams({ returnTo })}`
      )
      expect(mocks.remoteMount).not.toHaveBeenCalled()
      expect(mocks.loadSettings).not.toHaveBeenCalled()
    }
  )
})
