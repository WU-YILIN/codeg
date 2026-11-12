import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { FileWorkspaceTab } from "@/contexts/workspace-context"
import { FileDocumentView } from "./file-document-view"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name: string }) =>
    values ? `${key}: ${values.name}` : key,
}))
vi.mock("@/components/ai-elements/code-block", () => ({
  CodeBlockContent: ({ code }: { code: string }) => <pre>{code}</pre>,
}))
vi.mock("./html-preview", () => ({ HtmlPreview: () => null }))
vi.mock("./markdown-document-preview", () => ({
  MarkdownDocumentPreview: () => null,
}))
vi.mock("./office-preview", () => ({ OfficePreview: () => null }))
vi.mock("./pdf-preview", () => ({ PdfPreview: () => null }))

beforeEach(() => {
  vi.stubGlobal("URL", class extends URL {})
  URL.createObjectURL = vi.fn(() => "blob:shared-preview")
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("shared file document media dispatch", () => {
  it.each([
    ["audio", "audio/mpeg", "mediaAudioPlayer"],
    ["video", "video/mp4", "mediaVideoPlayer"],
  ])(
    "plays %s in the drawer/canvas renderer even with source view selected",
    (language, mime, label) => {
      const tab: FileWorkspaceTab = {
        id: "media",
        kind: "file",
        folderId: null,
        title: "demo",
        description: null,
        path: "/repo/demo",
        language,
        content: `data:${mime};base64,AQID`,
        loading: false,
        readonly: true,
      }
      render(
        <FileDocumentView
          tab={tab}
          io={null}
          previewRoot={null}
          isPreview={false}
        />
      )
      expect(screen.getByLabelText(`${label}: demo`)).toHaveAttribute(
        "src",
        "blob:shared-preview"
      )
      expect(screen.queryByText(tab.content)).not.toBeInTheDocument()
    }
  )
})
