"use client"

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import { useActiveFolder } from "@/contexts/active-folder-context"
import { useTabActions } from "@/contexts/tab-context"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { getActiveRemoteConnectionId } from "@/lib/transport"
import { useOptionalMantapalAccount } from "./account-provider"
import { MantapalIcon } from "./icons"
import {
  readProjectNote,
  subscribeProjectNotes,
  writeProjectNote,
} from "./project-notes"

export function ProjectNote() {
  const { activeFolder } = useActiveFolder()
  const account = useOptionalMantapalAccount()?.account
  const key = JSON.stringify([
    account?.id ?? "local",
    getActiveRemoteConnectionId() ?? "local",
    activeFolder?.id ?? "personal",
  ])
  const value = useSyncExternalStore(
    subscribeProjectNotes,
    () => readProjectNote(key),
    () => ""
  )
  const [failed, setFailed] = useState(false)
  return (
    <section className="mp-project-note">
      <header>
        <h2>随手记</h2>
        <small>
          {activeFolder?.alias || activeFolder?.name || "个人工作空间"}
        </small>
      </header>
      <textarea
        aria-label="项目随手记"
        maxLength={2000}
        value={value}
        onChange={(event) =>
          setFailed(!writeProjectNote(key, event.target.value))
        }
        placeholder={
          "比如：\n登录页的文字再少一点。\n提交前，记得走一遍找回密码。"
        }
      />
      <small role="status">
        {failed
          ? "当前浏览器无法保存，请先复制这段内容。"
          : value
            ? "已保存在这个设备"
            : "写下就会保存，不用整理成完整句子。"}
      </small>
    </section>
  )
}
export function MantapalWelcome({
  children,
  onSuggest,
}: {
  children?: ReactNode
  onSuggest?: (text: string) => void
}) {
  const account = useOptionalMantapalAccount()?.account
  const { activeFolder } = useActiveFolder()
  const conversations = useAppWorkspaceStore((s) => s.conversations)
  const folders = useAppWorkspaceStore((s) => s.allFolders)
  const loading = useAppWorkspaceStore((s) => s.conversationsLoading)
  const loadError = useAppWorkspaceStore((s) => s.conversationsError)
  const refresh = useAppWorkspaceStore((s) => s.refreshConversations)
  const { openTab, openNewConversationTab, openChatModeTab } = useTabActions()
  const { setRoute, openConversations } = useWorkbenchRoute()
  const date = useSyncExternalStore(
    () => () => {},
    () =>
      new Date().toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "long",
        timeZone: "Asia/Shanghai",
      }),
    () => ""
  )
  const recent = useMemo(
    () =>
      conversations
        .filter((c) => !c.parent_id)
        .slice()
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, 4),
    [conversations]
  )
  function openNew() {
    openConversations()
    if (activeFolder) openNewConversationTab(activeFolder.id, activeFolder.path)
    else openChatModeTab()
  }
  return (
    <section className="mp-work-home">
      <header className="mp-work-header">
        <p>
          {date}
          <span>个人工作空间</span>
        </p>
        <h1>{account?.name ? `你好，${account.name}。` : "从这里接着做。"}</h1>
        <p>最近的项目都在这里，可以接着做，也可以开一件新事。</p>
      </header>
      <div className="mp-work-grid">
        <div className="mp-work-main">
          <section aria-label="最近工作">
            <div className="mp-section-heading">
              <h2>最近工作</h2>
              <button onClick={() => setRoute("tasks")}>查看待办 →</button>
            </div>
            {loadError ? (
              <p className="mp-error">
                会话暂时没加载出来。
                <button className="mp-link" onClick={() => void refresh()}>
                  重试
                </button>
              </p>
            ) : recent.length ? (
              recent.map((item) => (
                <button
                  key={item.id}
                  className="mp-work-row"
                  onClick={() => {
                    openConversations()
                    openTab(
                      item.folder_id,
                      item.id,
                      item.agent_type,
                      false,
                      item.title ?? undefined
                    )
                  }}
                >
                  <MantapalIcon name="chat" />
                  <span>
                    <strong>{item.title || "未命名会话"}</strong>
                    <small>
                      {folders.find((f) => f.id === item.folder_id)?.name ||
                        "个人工作空间"}{" "}
                      · {item.message_count} 条消息
                    </small>
                  </span>
                  <time dateTime={item.updated_at}>
                    {Number.isFinite(Date.parse(item.updated_at))
                      ? new Date(item.updated_at).toLocaleDateString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          timeZone: "Asia/Shanghai",
                        })
                      : ""}
                  </time>
                  <span aria-hidden="true">↗</span>
                </button>
              ))
            ) : (
              <p className="mp-empty">
                {loading
                  ? "正在读取最近会话…"
                  : "还没有会话。写下第一件要做的事，它会留在这里。"}
              </p>
            )}
          </section>
          <section className="mp-new-work">
            <div className="mp-section-heading">
              <h2>新开一件事</h2>
              <small>先写个大概，细节边做边补。</small>
            </div>
            {children || (
              <button className="mp-secondary" onClick={openNew}>
                新建会话 →
              </button>
            )}
            {onSuggest && (
              <div className="mp-starters">
                <span>也可以从这里开始</span>
                {[
                  [
                    "先看项目",
                    "先帮我看看这个项目：目录怎么分，入口在哪里，有哪些地方需要留意。先给我说明，暂时不要改文件。",
                  ],
                  [
                    "改一个页面",
                    "帮我整理登录页的三种登录方式，把错误提示和忘记密码流程也检查一遍。",
                  ],
                  [
                    "整理材料",
                    "根据我添加的材料，整理出要做的事、还缺的信息，以及需要我确认的地方。",
                  ],
                ].map(([label, text]) => (
                  <button key={label} onClick={() => onSuggest(text)}>
                    {label} ↗
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="mp-home-notes">
          <div className="mp-section-heading">
            <h2>手边的项目</h2>
          </div>
          <button
            className="mp-current-project"
            onClick={() => setRoute("forge")}
          >
            <MantapalIcon name="projects" />
            <span>
              {activeFolder?.alias || activeFolder?.name || "个人工作空间"}
              <small>打开项目与变更 ↗</small>
            </span>
          </button>
          <ProjectNote />
        </aside>
      </div>
    </section>
  )
}
