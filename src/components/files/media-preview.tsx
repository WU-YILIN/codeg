"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Music2 } from "lucide-react"
import { useTranslations } from "next-intl"

import type { FileWorkspaceTab } from "@/contexts/workspace-context"
import { useOverlayHostHidden } from "@/components/ui/overlay-host-hidden"

/** The shared read-only audio/video body for the column, drawer and canvas. */
export function MediaPreview({ tab }: { tab: FileWorkspaceTab }) {
  const t = useTranslations("Folder.fileWorkspacePanel")
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const playerRef = useRef<HTMLMediaElement | null>(null)
  const hostHidden = useOverlayHostHidden()
  const content = tab.content
  const failed = failedSource === content
  const video = tab.language === "video"
  const hasMedia = content.startsWith(`data:${tab.language}/`)

  // React 19 ref cleanup runs on source replacement as well as unmount. Keep
  // Blob allocation out of render (including abandoned/StrictMode renders),
  // and disconnect the player before releasing the URL it may still be using.
  const attachPlayer = useCallback(
    (player: HTMLMediaElement | null) => {
      playerRef.current = player
      if (!player) return
      let url: string
      try {
        const match = /^data:((?:audio|video)\/[\w.+-]+);base64,(.*)$/s.exec(
          content
        )
        if (!match) throw new Error("Invalid media data URL")
        const binary = atob(match[2])
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        url = URL.createObjectURL(new Blob([bytes], { type: match[1] }))
      } catch {
        setFailedSource(content)
        return
      }
      player.src = url
      return () => {
        playerRef.current = null
        player.pause()
        player.removeAttribute("src")
        player.load()
        URL.revokeObjectURL(url)
      }
    },
    [content]
  )

  // Workspace panes can be hidden while kept mounted. Hiding a playing pane
  // must pause it too; showing it again never resumes without a user action.
  useEffect(() => {
    if (hostHidden) playerRef.current?.pause()
  }, [hostHidden])

  if (!hasMedia) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
        {tab.loading ? (
          <p role="status">{t("mediaLoading")}</p>
        ) : (
          <div role="alert" className="space-y-2">
            <p>{t("mediaReadError")}</p>
            {tab.saveError && <p>{tab.saveError}</p>}
          </div>
        )}
      </div>
    )
  }

  const playerProps = {
    ref: attachPlayer,
    controls: true,
    preload: "metadata",
    hidden: failed,
    onError: () => setFailedSource(content),
    onLoadStart: () => setFailedSource(null),
    className:
      "max-h-full w-full rounded-md focus-visible:outline-2 focus-visible:outline-ring",
    "aria-label": t(video ? "mediaVideoPlayer" : "mediaAudioPlayer", {
      name: tab.title,
    }),
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-auto bg-muted/20 p-4">
      {tab.loading && (
        <p
          role="status"
          className="absolute top-2 right-3 z-10 rounded-md bg-background/90 px-2 py-1 text-2xs text-muted-foreground"
        >
          {t("mediaLoading")}
        </p>
      )}
      {!video && !failed && (
        <div className="flex max-w-full flex-col items-center gap-3 text-muted-foreground">
          <Music2 aria-hidden="true" className="size-10" />
          <p className="max-w-full truncate text-sm">{tab.title}</p>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-center text-xs text-muted-foreground">
          {t("mediaPlaybackError")}
        </p>
      )}
      {video ? (
        <video {...playerProps} playsInline />
      ) : (
        <audio {...playerProps} />
      )}
    </div>
  )
}
