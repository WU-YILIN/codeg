const PREFIX = "mantapal:project-note:v1:"
const EVENT = "mantapal:project-note-change"
const fallback = new Map<string, string>()
export function readProjectNote(key: string): string {
  if (typeof window === "undefined") return ""
  if (fallback.has(key)) return fallback.get(key)!
  try {
    return localStorage.getItem(PREFIX + key) ?? ""
  } catch {
    return ""
  }
}
export function writeProjectNote(key: string, value: string): boolean {
  const text = value.slice(0, 2000)
  let saved = true
  try {
    localStorage.setItem(PREFIX + key, text)
    fallback.delete(key)
  } catch {
    fallback.set(key, text)
    saved = false
  }
  window.dispatchEvent(new Event(EVENT))
  return saved
}
export function subscribeProjectNotes(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PREFIX)) {
      if (event.key) fallback.delete(event.key.slice(PREFIX.length))
      else fallback.clear()
      onChange()
    }
  }
  window.addEventListener(EVENT, onChange)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener("storage", onStorage)
  }
}
