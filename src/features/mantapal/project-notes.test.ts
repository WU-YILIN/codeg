import { afterEach, describe, expect, it, vi } from "vitest"
import {
  readProjectNote,
  subscribeProjectNotes,
  writeProjectNote,
} from "./project-notes"
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})
describe("project notes", () => {
  it("keeps different accounts, projects and remotes separate", () => {
    const keys = [
      ["a", "local", 1],
      ["b", "local", 1],
      ["a", "remote", 1],
      ["a", "local", 2],
    ].map((value) => JSON.stringify(value))
    keys.forEach((key, i) => writeProjectNote(key, `note ${i}`))
    keys.forEach((key, i) => expect(readProjectNote(key)).toBe(`note ${i}`))
  })
  it("retains edits in memory when browser storage is full and reports failure", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    expect(writeProjectNote("quota", "不要丢掉这句话")).toBe(false)
    expect(readProjectNote("quota")).toBe("不要丢掉这句话")
    vi.restoreAllMocks()
    expect(writeProjectNote("quota", "保存成功")).toBe(true)
    expect(readProjectNote("quota")).toBe("保存成功")
  })
  it("updates subscribers locally and across tabs, and releases listeners", () => {
    const changed = vi.fn()
    const unsubscribe = subscribeProjectNotes(changed)
    writeProjectNote("sync", "draft")
    window.dispatchEvent(
      new StorageEvent("storage", { key: "mantapal:project-note:v1:sync" })
    )
    expect(changed).toHaveBeenCalledTimes(2)
    unsubscribe()
    writeProjectNote("sync", "done")
    expect(changed).toHaveBeenCalledTimes(2)
  })
})
