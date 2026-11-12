import { describe, expect, it } from "vitest"
import { getMediaMimeType, getMediaPreviewType } from "./media-preview"

describe("media file classification", () => {
  it.each([
    ["song.mp3", "audio", "audio/mpeg"],
    ["song.wav", "audio", "audio/wav"],
    ["song.ogg", "audio", "audio/ogg"],
    ["song.oga", "audio", "audio/ogg"],
    ["song.flac", "audio", "audio/flac"],
    ["song.m4a", "audio", "audio/mp4"],
    ["song.aac", "audio", "audio/aac"],
    ["song.opus", "audio", "audio/ogg"],
    ["song.weba", "audio", "audio/webm"],
    ["clip.mp4", "video", "video/mp4"],
    ["clip.m4v", "video", "video/mp4"],
    ["clip.webm", "video", "video/webm"],
    ["clip.ogv", "video", "video/ogg"],
    ["clip.mov", "video", "video/quicktime"],
    ["C:\\Media\\CLIP.MP4", "video", "video/mp4"],
    ["/repo/sound.MP3", "audio", "audio/mpeg"],
  ])("routes %s to the correct player and MIME", (path, kind, mime) => {
    expect(getMediaPreviewType(path)).toBe(kind)
    expect(getMediaMimeType(path)).toBe(mime)
  })

  it.each([
    null,
    undefined,
    "",
    "mp3",
    "/repo.mp4/README",
    "clip.mp4.txt",
    "note.constructor",
    "note.__proto__",
  ])("does not classify a non-media basename: %s", (path) => {
    expect(getMediaPreviewType(path)).toBeNull()
    expect(getMediaMimeType(path)).toBeNull()
  })
})
