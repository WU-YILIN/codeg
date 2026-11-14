import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createDemoAccountService } from "./demo-account"
import type { AccountService, MantapalAccount } from "./contract"

const context = vi.hoisted(() => ({
  service: null as AccountService | null,
  account: null as MantapalAccount | null,
  loading: false,
  error: "",
  demo: false,
  signedIn: vi.fn(),
  refresh: vi.fn(),
}))
const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("./account-provider", () => ({ useMantapalAccount: () => context }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
import { MantapalAuthScreen } from "./auth-screen"
const input = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const submit = (name: string) =>
  fireEvent.submit(screen.getByRole("form", { name }))
beforeEach(() => {
  context.service = createDemoAccountService()
  context.account = null
  context.error = ""
  context.demo = false
  context.signedIn.mockClear()
  router.replace.mockClear()
  window.history.replaceState(null, "", "/login")
})
afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, "", "/")
})

describe("Mantapal login and registration", () => {
  it("has password, phone and WeChat methods without production demo or region markers", () => {
    render(<MantapalAuthScreen />)
    expect(screen.getByRole("tab", { name: "验证码登录" })).toBeVisible()
    expect(screen.getByRole("tab", { name: "账号密码" })).toBeVisible()
    expect(screen.getByRole("tab", { name: "微信扫码" })).toBeVisible()
    expect(screen.queryByText(/一键进入测试/)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/国内版|默认 Agent|自带 API/)
    ).not.toBeInTheDocument()
  })
  it("moves between login tabs with arrow keys, Home and End, including wraparound", async () => {
    const user = userEvent.setup()
    render(<MantapalAuthScreen />)
    const phone = screen.getByRole("tab", { name: "验证码登录" })
    const password = screen.getByRole("tab", { name: "账号密码" })
    const wechat = screen.getByRole("tab", { name: "微信扫码" })
    const assertSelected = (tab: HTMLElement, name: string) => {
      expect(tab).toHaveFocus()
      expect(tab).toHaveAttribute("aria-selected", "true")
      expect(tab).toHaveAttribute("tabindex", "0")
      for (const other of [phone, password, wechat].filter(
        (item) => item !== tab
      )) {
        expect(other).toHaveAttribute("tabindex", "-1")
        expect(other).toHaveAttribute("aria-selected", "false")
      }
      expect(screen.getByRole("tabpanel", { name })).toHaveAttribute(
        "id",
        tab.getAttribute("aria-controls")
      )
    }
    phone.focus()
    await user.keyboard("{ArrowLeft}")
    assertSelected(wechat, "微信扫码")
    await user.keyboard("{ArrowRight}")
    assertSelected(phone, "验证码登录")
    await user.keyboard("{ArrowRight}")
    assertSelected(password, "账号密码")
    await user.keyboard("{End}")
    assertSelected(wechat, "微信扫码")
    await user.keyboard("{Home}")
    assertSelected(phone, "验证码登录")
    await user.tab()
    expect(screen.getByLabelText("手机号码")).toHaveFocus()
  })
  it("clears password and stale errors when changing methods with the keyboard", async () => {
    const user = userEvent.setup()
    render(<MantapalAuthScreen />)
    const passwordTab = screen.getByRole("tab", { name: "账号密码" })
    await user.click(passwordTab)
    await user.type(screen.getByLabelText("账号 / 手机号"), "Levi")
    await user.type(screen.getByLabelText("密码"), "wrong")
    await user.click(screen.getByRole("button", { name: /登录 Mantapal/ }))
    await screen.findByRole("alert")
    passwordTab.focus()
    await user.keyboard("{ArrowLeft}{ArrowRight}")
    expect(passwordTab).toHaveFocus()
    expect(screen.getByLabelText("密码")).toHaveValue("")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
  it("does not change the selected method while a login request is pending", async () => {
    const user = userEvent.setup()
    let finish!: (account: MantapalAccount) => void
    vi.spyOn(context.service!, "password").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    render(<MantapalAuthScreen />)
    const passwordTab = screen.getByRole("tab", { name: "账号密码" })
    await user.click(passwordTab)
    input("账号 / 手机号", "Levi")
    input("密码", "Mantapal123!")
    submit("回到工作台")
    expect(passwordTab).toBeDisabled()
    fireEvent.keyDown(passwordTab, { key: "ArrowLeft" })
    expect(passwordTab).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel", { name: "账号密码" })).toBeVisible()
    await act(async () => {
      finish({
        id: "test",
        name: "Levi",
        phoneMasked: "138 **** 8000",
        tier: "free",
        firstUse: false,
        wechatBound: false,
      })
    })
    expect(context.signedIn).toHaveBeenCalled()
  })
  it("requires explicit consent and submits the policy version before account creation", async () => {
    const register = vi.spyOn(context.service!, "register")
    render(<MantapalAuthScreen />)
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }))
    const consent = await screen.findByRole("checkbox", { name: /我已阅读/ })
    expect(consent).not.toBeChecked()
    expect(screen.getByRole("button", { name: /同意并创建/ })).toBeDisabled()
    input("手机号码", "13800138000")
    input("验证码", "123456")
    input("密码", "Mantapal123!")
    submit("创建你的账号")
    await screen.findByText("请阅读并同意隐私政策与权益声明。")
    expect(register).not.toHaveBeenCalled()
    fireEvent.click(consent)
    submit("创建你的账号")
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({
          accepted: true,
          policyVersion: "demo-2026-11",
          phone: "13800138000",
        })
      )
    )
    await waitFor(() =>
      expect(context.signedIn).toHaveBeenCalledWith(
        expect.objectContaining({ firstUse: true })
      )
    )
  })
  it("shows an error for a wrong password and signs in with the correct one", async () => {
    render(<MantapalAuthScreen />)
    fireEvent.click(screen.getByRole("tab", { name: "账号密码" }))
    input("账号 / 手机号", "Levi")
    input("密码", "wrong")
    submit("回到工作台")
    await screen.findByRole("alert")
    expect(context.signedIn).not.toHaveBeenCalled()
    input("密码", "Mantapal123!")
    submit("回到工作台")
    await waitFor(() => expect(context.signedIn).toHaveBeenCalled())
  })
  it("verifies the phone, rejects mismatched passwords and completes password recovery", async () => {
    render(<MantapalAuthScreen />)
    fireEvent.click(screen.getByRole("tab", { name: "账号密码" }))
    fireEvent.click(screen.getByRole("button", { name: "忘记密码？" }))
    input("手机号码", "13800138000")
    input("验证码", "123456")
    submit("找回密码")
    await screen.findByRole("heading", { name: "设置新密码" })
    input("新密码", "NewPassword123")
    input("再次输入密码", "Other123")
    submit("设置新密码")
    await screen.findByText("两次输入的密码不一致。")
    input("再次输入密码", "NewPassword123")
    submit("设置新密码")
    await screen.findByRole("heading", { name: "密码已更新" })
    expect(context.signedIn).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "返回账号密码登录" }))
    input("账号 / 手机号", "Levi")
    input("密码", "NewPassword123")
    submit("回到工作台")
    await waitFor(() => expect(context.signedIn).toHaveBeenCalled())
  })
  it("preserves OTP cooldown when changing login methods", async () => {
    render(<MantapalAuthScreen />)
    input("手机号码", "13800138000")
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }))
    await screen.findByRole("button", { name: /秒后重发/ })
    fireEvent.click(screen.getByRole("tab", { name: "账号密码" }))
    fireEvent.click(screen.getByRole("tab", { name: "验证码登录" }))
    expect(screen.getByRole("button", { name: /秒后重发/ })).toBeDisabled()
  })
  it("requires phone verification and consent after a new WeChat authorization", async () => {
    vi.useFakeTimers()
    render(<MantapalAuthScreen />)
    fireEvent.click(screen.getByRole("tab", { name: "微信扫码" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(
      screen.getByRole("heading", { name: "绑定手机号码" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /同意并绑定/ })).toBeDisabled()
    expect(context.signedIn).not.toHaveBeenCalled()
    input("手机号码", "13800138000")
    input("验证码", "123456")
    fireEvent.click(screen.getByRole("checkbox", { name: /我已阅读/ }))
    await act(async () => {
      submit("绑定手机号码")
    })
    expect(context.signedIn).toHaveBeenCalledWith(
      expect.objectContaining({ wechatBound: true, firstUse: true })
    )
  })
  it("offers only a name in onboarding and persists it before entering", async () => {
    const returnTo =
      "/settings/appearance?remoteConnectionId=17&remoteWindowId=rw-test"
    window.history.replaceState(
      null,
      "",
      `/login?${new URLSearchParams({ returnTo })}`
    )
    context.account = await context.service!.register({
      phone: "13800138000",
      code: "123456",
      password: "Mantapal123!",
      accepted: true,
      policyVersion: "test",
    })
    const { rerender } = render(<MantapalAuthScreen />)
    input("怎么称呼你", "小吴")
    submit("先认识一下")
    await waitFor(() =>
      expect(context.signedIn).toHaveBeenCalledWith(
        expect.objectContaining({ name: "小吴", firstUse: false })
      )
    )
    expect(screen.queryByText(/默认 Agent|自带 API/)).not.toBeInTheDocument()
    expect(router.replace).not.toHaveBeenCalled()
    context.account = context.signedIn.mock.calls[0][0]
    rerender(<MantapalAuthScreen />)
    expect(router.replace).toHaveBeenCalledWith(returnTo)
  })
  it.each([
    [
      "/settings/agents?remoteConnectionId=7&remoteWindowId=rw-7",
      "/settings/agents?remoteConnectionId=7&remoteWindowId=rw-7",
    ],
    ["https://outside.example/settings", "/"],
  ])(
    "returns authenticated users only to safe settings destinations: %s",
    async (returnTo, expected) => {
      window.history.replaceState(
        null,
        "",
        `/login?${new URLSearchParams({ returnTo })}`
      )
      context.account = await context.service!.phone("13800138000", "123456")
      render(<MantapalAuthScreen />)
      expect(router.replace).toHaveBeenCalledWith(expected)
    }
  )
  it("disables authentication when the real service is unavailable", () => {
    context.error = "账户服务尚未接通。"
    render(<MantapalAuthScreen />)
    expect(screen.getByRole("button", { name: /登录 Mantapal/ })).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent("尚未接通")
    fireEvent.click(screen.getByRole("tab", { name: "微信扫码" }))
    expect(screen.getByText("二维码暂时不可用")).toBeInTheDocument()
    expect(screen.queryByText("正在获取二维码…")).not.toBeInTheDocument()
  })
})
