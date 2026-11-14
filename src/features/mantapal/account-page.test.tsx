import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import type { MantapalAccount } from "./contract"

const context = vi.hoisted(() => ({
  account: {
    id: "account-one",
    name: "Levi",
    phoneMasked: "138 **** 8000",
    tier: "free" as const,
    firstUse: false,
    wechatBound: false,
  },
  service: { updateName: vi.fn() },
  signedIn: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  demo: false,
  error: "",
}))
vi.mock("./account-provider", () => ({
  useMantapalAccount: () => context,
  useOptionalMantapalAccount: () => context,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock("@/lib/api", () => ({ openSettingsWindow: vi.fn() }))
vi.mock("@/contexts/workbench-route-context", () => ({
  useWorkbenchRoute: vi.fn(),
}))
vi.mock("@/contexts/sidebar-context", () => ({ useSidebarContext: vi.fn() }))
import { MantapalAccountPage } from "./account-page"

beforeEach(() => vi.clearAllMocks())

it("does not restore an account from a profile save that finishes after leaving the page", async () => {
  let finish!: (value: MantapalAccount) => void
  context.service.updateName.mockReturnValue(
    new Promise((resolve) => (finish = resolve))
  )
  const view = render(<MantapalAccountPage />)
  fireEvent.change(screen.getByLabelText("昵称"), {
    target: { value: "新称呼" },
  })
  fireEvent.click(screen.getByRole("button", { name: "保存称呼" }))
  expect(context.service.updateName).toHaveBeenCalledWith("新称呼")
  // AccountGate removes this page when another window signs out.
  view.unmount()
  await act(async () => finish({ ...context.account, name: "新称呼" }))
  expect(context.signedIn).not.toHaveBeenCalled()
})

it("applies a profile save while the account page is still active", async () => {
  const updated = { ...context.account, name: "小吴" }
  context.service.updateName.mockResolvedValue(updated)
  render(<MantapalAccountPage />)
  fireEvent.change(screen.getByLabelText("昵称"), {
    target: { value: "小吴" },
  })
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "保存称呼" }))
  )
  expect(context.signedIn).toHaveBeenCalledWith(updated)
  expect(screen.getByRole("status")).toHaveTextContent("称呼已保存。")
})
