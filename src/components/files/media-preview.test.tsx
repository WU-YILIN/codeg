import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { FileWorkspaceTab } from "@/contexts/workspace-context"
import { MediaPreview } from "./media-preview"
import { OverlayHostHiddenProvider } from "@/components/ui/overlay-host-hidden"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name: string }) =>
    values ? `${key}: ${values.name}` : key,
}))

function tab(overrides: Partial<FileWorkspaceTab> = {}): FileWorkspaceTab {
  return {
    id: "file:media",
    kind: "file",
    folderId: null,
    title: "demo.mp4",
    description: null,
    path: "/repo/demo.mp4",
    language: "video",
    content: "data:video/mp4;base64,AQID",
    loading: false,
    readonly: true,
    ...overrides,
  } as FileWorkspaceTab
}

const createUrl = vi.fn<(blob: Blob) => string>()
const revokeUrl = vi.fn()

beforeEach(() => {
  createUrl.mockReset().mockReturnValue("blob:media-1")
  revokeUrl.mockReset()
  vi.stubGlobal("URL", class extends URL {})
  URL.createObjectURL = createUrl
  URL.revokeObjectURL = revokeUrl
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("MediaPreview", () => {
  it("pauses a kept-mounted player when its host is hidden without auto-resuming", () => {
    const { rerender } = render(
      <OverlayHostHiddenProvider hidden={false}>
        <MediaPreview tab={tab()} />
      </OverlayHostHiddenProvider>
    )
    const player = screen.getByLabelText(
      "mediaVideoPlayer: demo.mp4"
    ) as HTMLVideoElement
    expect(player.pause).not.toHaveBeenCalled()
    rerender(
      <OverlayHostHiddenProvider hidden>
        <MediaPreview tab={tab()} />
      </OverlayHostHiddenProvider>
    )
    expect(player.pause).toHaveBeenCalledTimes(1)
    rerender(
      <OverlayHostHiddenProvider hidden={false}>
        <MediaPreview tab={tab()} />
      </OverlayHostHiddenProvider>
    )
    expect(player.pause).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["video", "video/mp4", "video", "mediaVideoPlayer"],
    ["audio", "audio/mpeg", "audio", "mediaAudioPlayer"],
  ])(
    "renders %s with decoded bytes and native controls",
    (kind, mime, tag, label) => {
      render(
        <MediaPreview
          tab={tab({ language: kind, content: `data:${mime};base64,AQID` })}
        />
      )
      const player = screen.getByLabelText(`${label}: demo.mp4`)
      expect(player.tagName.toLowerCase()).toBe(tag)
      expect(player).toHaveAttribute("src", "blob:media-1")
      expect(player).toHaveAttribute("controls")
      expect(player).not.toHaveAttribute("autoplay")
      expect(player).toHaveAttribute("preload", "metadata")
      const blob = createUrl.mock.calls[0][0]
      expect(blob.type).toBe(mime)
      expect(blob.size).toBe(3)
      const reader = new FileReader()
      return new Promise<void>((resolve) => {
        reader.onload = () => {
          expect(
            Array.from(new Uint8Array(reader.result as ArrayBuffer))
          ).toEqual([1, 2, 3])
          resolve()
        }
        reader.readAsArrayBuffer(blob)
      })
    }
  )

  it("shows cold loading without creating a media source", () => {
    render(<MediaPreview tab={tab({ loading: true, content: "" })} />)
    expect(screen.getByRole("status")).toHaveTextContent("mediaLoading")
    expect(createUrl).not.toHaveBeenCalled()
  })

  it("surfaces a failed or oversize read without playing the error as a URL", () => {
    render(
      <MediaPreview
        tab={tab({
          content: "Load failed",
          saveState: "error",
          saveError: "File exceeds 100 MB",
        })}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent("File exceeds 100 MB")
    expect(createUrl).not.toHaveBeenCalled()
  })

  it("reports decoding failures and recovers when another source is loaded", () => {
    const { rerender } = render(<MediaPreview tab={tab()} />)
    fireEvent.error(screen.getByLabelText("mediaVideoPlayer: demo.mp4"))
    expect(screen.getByRole("alert")).toHaveTextContent("mediaPlaybackError")
    rerender(
      <MediaPreview tab={tab({ content: "data:video/mp4;base64,BAUG" })} />
    )
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(
      screen.getByLabelText("mediaVideoPlayer: demo.mp4")
    ).not.toHaveAttribute("hidden")
  })

  it("reports malformed data without leaking a URL or throwing during render", () => {
    render(<MediaPreview tab={tab({ content: "data:video/mp4;base64,%%%" })} />)
    expect(screen.getByRole("alert")).toHaveTextContent("mediaPlaybackError")
    expect(createUrl).not.toHaveBeenCalled()
  })

  it("stops playback and frees each Blob when reloading and closing", () => {
    createUrl.mockReturnValueOnce("blob:old").mockReturnValueOnce("blob:new")
    const { rerender, unmount } = render(<MediaPreview tab={tab()} />)
    const player = screen.getByLabelText(
      "mediaVideoPlayer: demo.mp4"
    ) as HTMLVideoElement
    rerender(
      <MediaPreview tab={tab({ content: "data:video/mp4;base64,BAUG" })} />
    )
    expect(revokeUrl).toHaveBeenCalledWith("blob:old")
    expect(player.pause).toHaveBeenCalled()
    expect(player).toHaveAttribute("src", "blob:new")
    unmount()
    expect(revokeUrl).toHaveBeenCalledWith("blob:new")
    expect(player).not.toHaveAttribute("src")
  })

  it("keeps the current player and source during a non-destructive refresh", () => {
    const { rerender } = render(<MediaPreview tab={tab()} />)
    const player = screen.getByLabelText("mediaVideoPlayer: demo.mp4")
    rerender(<MediaPreview tab={tab({ loading: true })} />)
    expect(screen.getByLabelText("mediaVideoPlayer: demo.mp4")).toBe(player)
    expect(screen.getByRole("status")).toHaveTextContent("mediaLoading")
    expect(createUrl).toHaveBeenCalledTimes(1)
    expect(revokeUrl).not.toHaveBeenCalled()
  })
})
