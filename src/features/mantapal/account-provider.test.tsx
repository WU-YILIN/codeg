import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MantapalAccount } from "./contract"

const mocks = vi.hoisted(() => ({ session: vi.fn(), logout: vi.fn() }))
vi.mock("./account-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./account-client")>()),
  createAccountClient: () => mocks,
}))
import { AccountServiceError } from "./account-client"
import { MantapalAccountProvider, useMantapalAccount } from "./account-provider"

const account: MantapalAccount = {
  id: "test-account",
  name: "小吴",
  phoneMasked: "138 **** 8000",
  tier: "free",
  firstUse: false,
  wechatBound: false,
}
const session = (value: MantapalAccount | null) => ({
  account: value,
  csrfToken: "private-csrf-value",
})
const key = "mantapal:account-session:v1"
function Probe() {
  const context = useMantapalAccount()
  return (
    <>
      <p>{context.account?.name || "未登录"}</p>
      <p>{context.error}</p>
      <button onClick={() => context.signedIn(account)}>登录</button>
      <button onClick={() => void context.logout().catch(() => {})}>
        退出
      </button>
    </>
  )
}
function openWindow() {
  render(
    <MantapalAccountProvider>
      <Probe />
    </MantapalAccountProvider>
  )
}
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
}
function remoteEvent(action: string) {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key,
      newValue: JSON.stringify({ action, account: { name: "不可信账户" } }),
    })
  )
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  localStorage.clear()
  mocks.session.mockResolvedValue(session(account))
  mocks.logout.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

describe("account windows and session lifecycle", () => {
  it("does not let a late session read replace a completed login", async () => {
    let resolve!: (value: ReturnType<typeof session>) => void
    mocks.session.mockReturnValue(new Promise((done) => (resolve = done)))
    openWindow()
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "登录" }))
    await act(async () => resolve(session(null)))
    expect(screen.getByText("小吴")).toBeVisible()
  })

  it("clears another window immediately on logout and ignores its stale request", async () => {
    openWindow()
    await settle()
    let stale!: (value: ReturnType<typeof session>) => void
    mocks.session.mockReturnValueOnce(new Promise((done) => (stale = done)))
    act(() => window.dispatchEvent(new Event("focus")))
    mocks.session.mockResolvedValue(session(null))
    act(() => remoteEvent("logout"))
    expect(screen.getByText("未登录")).toBeVisible()
    await act(async () => stale(session(account)))
    expect(screen.queryByText("小吴")).not.toBeInTheDocument()
    expect(screen.queryByText("不可信账户")).not.toBeInTheDocument()
  })

  it("rechecks server identity after another window changes the session", async () => {
    openWindow()
    await settle()
    mocks.session.mockResolvedValue(session({ ...account, name: "新称呼" }))
    await act(async () => remoteEvent("refresh"))
    expect(screen.getByText("新称呼")).toBeVisible()
    expect(screen.queryByText("不可信账户")).not.toBeInTheDocument()
  })

  it("detects expiry when returning to a window even without storage events", async () => {
    openWindow()
    await settle()
    mocks.session.mockResolvedValue(session(null))
    await act(async () => window.dispatchEvent(new Event("focus")))
    expect(screen.getByText("未登录")).toBeVisible()
  })

  it("keeps the current workspace after a transient background connection failure", async () => {
    openWindow()
    await settle()
    mocks.session.mockRejectedValue(
      new AccountServiceError("请求超时，请重试。")
    )
    await act(async () => window.dispatchEvent(new Event("focus")))
    expect(screen.getByText("小吴")).toBeVisible()
    expect(screen.getByText("请求超时，请重试。")).toBeVisible()
  })

  it("clears the account when a background check explicitly rejects the session", async () => {
    openWindow()
    await settle()
    mocks.session.mockRejectedValue(new AccountServiceError("会话已过期", 401))
    await act(async () => window.dispatchEvent(new Event("focus")))
    expect(screen.getByText("未登录")).toBeVisible()
  })

  it("only announces logout after the service confirms revocation", async () => {
    openWindow()
    await settle()
    mocks.logout.mockRejectedValueOnce(new Error("offline"))
    await act(async () => fireEvent.click(screen.getByText("退出")))
    expect(screen.getByText("小吴")).toBeVisible()
    expect(localStorage.getItem(key)).toBeNull()
    mocks.session.mockResolvedValue(session(null))
    await act(async () => fireEvent.click(screen.getByText("退出")))
    expect(screen.getByText("未登录")).toBeVisible()
    const notice = JSON.parse(localStorage.getItem(key)!)
    expect(notice.action).toBe("logout")
    expect(Object.keys(notice).sort()).toEqual(["action", "nonce"])
    expect(localStorage.getItem(key)).not.toContain("private-csrf-value")
  })

  it("does not reattach listeners or requests after unmount", async () => {
    const window = render(
      <MantapalAccountProvider>
        <Probe />
      </MantapalAccountProvider>
    )
    await settle()
    window.unmount()
    mocks.session.mockClear()
    globalThis.window.dispatchEvent(new Event("focus"))
    remoteEvent("refresh")
    expect(mocks.session).not.toHaveBeenCalled()
  })
})
