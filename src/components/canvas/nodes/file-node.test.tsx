import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type { NodeProps } from "@xyflow/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OverlayHostHiddenProvider } from "@/components/ui/overlay-host-hidden"
import type { FileWorkspaceTab } from "@/contexts/workspace-context"
import { buildFileTabId } from "@/lib/file-tab-id"
import { FileNode, type FileFlowNode } from "./file-node"

const state = vi.hoisted(() => ({
  tab: null as FileWorkspaceTab | null,
  open: vi.fn(async () => "/repo/clip.mp4"),
  reload: vi.fn(async () => {}),
  readers: 0,
  retain: () => {
    state.readers += 1
    return () => {
      state.readers -= 1
    }
  },
}))

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/contexts/workspace-context", () => ({
  useWorkspaceActions: () => ({
    openFilePreview: state.open,
    reloadOpenFileBackground: state.reload,
    retainFileTabContent: state.retain,
    switchFileTab: vi.fn(),
    toggleFileTabPreview: vi.fn(),
  }),
  useWorkspaceFileTabs: () => ({
    fileTabs: state.tab ? [state.tab] : [],
    previewFileTabIds: new Set<string>(),
  }),
}))
vi.mock("@/contexts/workbench-route-context", () => ({
  useWorkbenchRoute: () => ({ openConversations: vi.fn() }),
}))
vi.mock("@/stores/app-workspace-store", () => ({
  useAppWorkspaceStore: (select: (value: { allFolders: [] }) => unknown) =>
    select({ allFolders: [] }),
}))
vi.mock("../canvas-view-context", () => ({
  useCanvasView: () => ({ endNodeResize: vi.fn(), deleteNode: vi.fn() }),
}))
// Keep the card's real buttons/effects; layout and document decoding are owned
// by their own components and aren't needed to exercise the reader lifecycle.
vi.mock("./card-frame", () => ({
  CARD_HEADER_BUTTON_CLASS: "",
  CardFrame: ({
    actions,
    children,
  }: {
    actions: ReactNode
    children: ReactNode
  }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}))
vi.mock("@/components/files/file-document-view", () => ({
  CenteredNotice: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  FileDocumentView: () => null,
}))

const props: NodeProps<FileFlowNode> = {
  id: "file-1",
  type: "file",
  data: {
    dbNode: {
      id: 1,
      board_id: 1,
      kind: "file",
      folder_id: null,
      folder_group_id: null,
      agent_type: null,
      conversation_id: null,
      member_ids: [],
      title: null,
      content: null,
      path: "/repo/clip.mp4",
      color: null,
      collapsed: false,
      grid_columns: 0,
      grid_rows: 0,
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      created_at: "",
      updated_at: "",
    },
    path: "/repo/clip.mp4",
    label: "clip.mp4",
  },
  selected: false,
  dragging: false,
  isConnectable: false,
  zIndex: 0,
  selectable: true,
  deletable: true,
  draggable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
}

beforeEach(() => {
  state.open.mockClear()
  state.reload.mockClear()
  state.readers = 0
  state.tab = {
    id: buildFileTabId({ kind: "file", path: "/repo/clip.mp4" }),
    kind: "file",
    folderId: null,
    title: "clip.mp4",
    description: null,
    path: "/repo/clip.mp4",
    language: "video",
    content: "",
    loading: false,
    readonly: true,
    stale: true,
    saveState: "idle",
  }
})
afterEach(cleanup)

function view(hidden = false, selected = false) {
  return (
    <OverlayHostHiddenProvider hidden={hidden}>
      <FileNode {...props} selected={selected} />
    </OverlayHostHiddenProvider>
  )
}

describe("canvas file reader lifecycle", () => {
  it("settles a failed automatic refresh and leaves retry to the user", () => {
    const rendered = render(view())
    expect(state.open).toHaveBeenCalledTimes(1)

    // The provider marks a stale tab refreshing before its read settles.
    state.tab = { ...state.tab!, loading: true }
    rendered.rerender(view(false, true))
    state.tab = {
      ...state.tab!,
      content: "Unable to read the file",
      loading: false,
      stale: true,
      saveState: "error",
    }
    // This harness supplies tab data through a hook double; force the memoized
    // node to consume the next tab snapshot, as the real context update does.
    rendered.rerender(view(false, false))
    expect(state.open).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "reloadFile" }))
    expect(state.reload).toHaveBeenCalledWith("/repo/clip.mp4")
  })

  it("releases hidden readers and reloads evicted bytes when shown again", () => {
    const rendered = render(view(true))
    expect(state.readers).toBe(0)
    expect(state.open).not.toHaveBeenCalled()

    rendered.rerender(view(false))
    expect(state.readers).toBe(1)
    expect(state.open).toHaveBeenCalledWith("/repo/clip.mp4", {
      background: true,
    })

    rendered.rerender(view(true))
    expect(state.readers).toBe(0)
    rendered.unmount()
    expect(state.readers).toBe(0)
  })
})
