export type MediaPreviewType = "audio" | "video"

const MEDIA_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  opus: "audio/ogg",
  weba: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mov: "video/quicktime",
}

/** Container MIME only; the browser decides whether its codecs can play. */
export function getMediaMimeType(
  path: string | null | undefined
): string | null {
  const basename = path?.split(/[\\/]/).pop()?.toLowerCase() ?? ""
  const dot = basename.lastIndexOf(".")
  if (dot === -1) return null
  const extension = basename.slice(dot + 1)
  return Object.prototype.hasOwnProperty.call(MEDIA_MIME, extension)
    ? MEDIA_MIME[extension]
    : null
}

export function getMediaPreviewType(
  path: string | null | undefined
): MediaPreviewType | null {
  const mime = getMediaMimeType(path)
  if (!mime) return null
  return mime.startsWith("audio/") ? "audio" : "video"
}
