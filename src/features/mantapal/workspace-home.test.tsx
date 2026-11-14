import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
const actions = vi.hoisted(() => ({
  openTab: vi.fn(),
  openConversations: vi.fn(),
  openChatModeTab: vi.fn(),
  openNewConversationTab: vi.fn(),
  setRoute: vi.fn(),
  refreshConversations: vi.fn(),
}))
const state = vi.hoisted(() => ({
  conversations: [
    {
      id: 21,
      folder_id: 3,
      title: "修复上次的表单错误",
      agent_type: "codex",
      updated_at: "2026-11-13T13:00:00Z",
      parent_id: null,
      message_count: 6,
    },
  ],
  allFolders: [{ id: 3, name: "Mantapal", path: "/projects/mantapal" }],
  conversationsLoading: false,
  conversationsError: null as string | null,
  activeFolder: { id: 3, name: "Mantapal", path: "/projects/mantapal" } as {
    id: number
    name: string
    path: string
  } | null,
}))
vi.mock("@/stores/app-workspace-store", () => ({
  useAppWorkspaceStore: (
    select: (s: typeof state & typeof actions) => unknown
  ) => select({ ...state, ...actions }),
}))
vi.mock("@/contexts/active-folder-context", () => ({
  useActiveFolder: () => ({ activeFolder: state.activeFolder }),
}))
vi.mock("@/contexts/tab-context", () => ({ useTabActions: () => actions }))
vi.mock("@/contexts/workbench-route-context", () => ({
  useWorkbenchRoute: () => actions,
}))
vi.mock("@/lib/transport", () => ({ getActiveRemoteConnectionId: () => null }))
vi.mock("./account-provider", () => ({
  useOptionalMantapalAccount: () => ({ account: { id: "levi", name: "Levi" } }),
}))
import { MantapalWelcome } from "./workspace-home"
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  state.conversationsError = null
  state.activeFolder = { id: 3, name: "Mantapal", path: "/projects/mantapal" }
})
describe("integrated workspace home", () => {
  it("opens real recent conversations through the existing tab actions", () => {
    render(<MantapalWelcome />)
    fireEvent.click(screen.getByRole("button", { name: /修复上次的表单错误/ }))
    expect(actions.openConversations).toHaveBeenCalled()
    expect(actions.openTab).toHaveBeenCalledWith(
      3,
      21,
      "codex",
      false,
      "修复上次的表单错误"
    )
  })
  it("keeps the original composer as a child and fills it from a suggestion", () => {
    const suggest = vi.fn()
    render(
      <MantapalWelcome onSuggest={suggest}>
        <textarea aria-label="原项目输入框" />
      </MantapalWelcome>
    )
    expect(screen.getByLabelText("原项目输入框")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "先看项目 ↗" }))
    expect(suggest).toHaveBeenCalledWith(
      expect.stringContaining("暂时不要改文件")
    )
  })
  it("reports data failures and retries the real store", () => {
    state.conversationsError = "offline"
    render(<MantapalWelcome />)
    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(actions.refreshConversations).toHaveBeenCalledOnce()
    expect(screen.queryByText("修复上次的表单错误")).not.toBeInTheDocument()
  })
  it("retains edits to the project note across remounts", () => {
    const first = render(<MantapalWelcome />)
    fireEvent.change(screen.getByLabelText("项目随手记"), {
      target: { value: "周五再看一遍注册流程" },
    })
    first.unmount()
    render(<MantapalWelcome />)
    expect(screen.getByLabelText("项目随手记")).toHaveValue(
      "周五再看一遍注册流程"
    )
  })
})
