"use client"
import Link from "next/link"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import { useSidebarContext } from "@/contexts/sidebar-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { openSettingsWindow, type SettingsSection } from "@/lib/api"
import {
  useMantapalAccount,
  useOptionalMantapalAccount,
} from "./account-provider"
import { MantapalIcon } from "./icons"
import type { MantapalUsage } from "./contract"

export function MantapalUserEntry() {
  const context = useOptionalMantapalAccount()
  const { setRoute, routeId } = useWorkbenchRoute()
  const { toggle } = useSidebarContext()
  const mobile = useIsMobile()
  const name = context?.account?.name || "我的账户"
  return (
    <button
      className="mp-user-entry"
      aria-label="用户中心与设置"
      aria-current={routeId === "account" ? "page" : undefined}
      onClick={() => {
        if (mobile) toggle()
        setRoute("account")
      }}
    >
      <span className="mp-avatar">{name.slice(0, 1)}</span>
      <span>
        <strong>{name}</strong>
        <small>
          {context?.account?.tier === "pro"
            ? "Pro"
            : context?.account
              ? "Free"
              : "账户与工作台设置"}
        </small>
      </span>
      <MantapalIcon name="more" />
    </button>
  )
}
export function MantapalUsageButton() {
  const { setRoute } = useWorkbenchRoute()
  return (
    <button
      className="mp-usage-button"
      onClick={() => setRoute("tokenUsage")}
      title="查看模型用量"
    >
      <MantapalIcon name="analytics" />
      用量
    </button>
  )
}
const settings: [SettingsSection, string, string][] = [
  ["general", "工作台", "会话、终端和工作区习惯"],
  ["appearance", "外观", "主题、字体和字号"],
  ["shortcuts", "快捷键", "查看和调整常用快捷键"],
  ["agents", "Agent", "管理已安装的编码工具"],
  ["mcp", "工具连接", "配置 MCP 服务"],
  ["skills", "技能", "管理工作中可用的技能"],
  ["version-control", "版本控制", "Git 和提交设置"],
  ["system", "系统", "连接、数据和诊断"],
]
export function MantapalAccountPage() {
  const {
    account,
    service,
    signedIn,
    logout,
    demo,
    error: sessionError,
    refresh,
  } = useMantapalAccount()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const router = useRouter()
  const [tab, setTab] = useState("profile")
  const [name, setName] = useState(account?.name || "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [usage, setUsage] = useState<MantapalUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!service || !account || tab !== "usage") return
    const abort = new AbortController()
    setUsage(null)
    setUsageError("")
    setUsageLoading(true)
    void service
      .usage(abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setUsage(value)
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setUsageError(
            cause instanceof Error ? cause.message : "用量暂时不可用。"
          )
      })
      .finally(() => {
        if (!abort.signal.aborted) setUsageLoading(false)
      })
    return () => abort.abort()
  }, [service, account, tab, retry])
  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (busy) return
      setBusy(true)
      setError("")
      setNotice("")
      try {
        await action()
      } catch (cause) {
        if (mounted.current)
          setError(
            cause instanceof Error ? cause.message : "操作失败，请重试。"
          )
      } finally {
        if (mounted.current) setBusy(false)
      }
    },
    [busy]
  )
  return (
    <section className="mp-account">
      <nav aria-label="用户设置分类">
        <p>你的 Mantapal</p>
        {[
          ["profile", "个人资料"],
          ["security", "账号与安全"],
          ["preferences", "工作台设置"],
          ["usage", "套餐与用量"],
          ["privacy", "隐私与权益"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id)
              setError("")
              setNotice("")
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="mp-account-body">
        {sessionError && (
          <p className="mp-error" role="alert">
            {sessionError}
            <button className="mp-link" onClick={() => void refresh()}>
              重新连接
            </button>
          </p>
        )}
        {tab === "profile" ? (
          <>
            <h1>个人资料</h1>
            <p className="mp-subtitle">留一个熟悉的称呼。</p>
            <div className="mp-profile-head">
              <span className="mp-avatar">{account?.name.slice(0, 1)}</span>
              <strong>{account?.name}</strong>
              <span className="mp-tier">
                {account?.tier === "pro"
                  ? "Pro"
                  : account?.tier === "free"
                    ? "Free"
                    : "未登录"}
              </span>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void run(async () => {
                  if (!service || !name.trim()) return
                  const updated = await service.updateName(name.trim())
                  if (!mounted.current) return
                  signedIn(updated)
                  setNotice("称呼已保存。")
                })
              }}
            >
              <label className="mp-field">
                昵称
                <input
                  className="mp-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={30}
                />
              </label>
              <button className="mp-secondary" disabled={busy || !name.trim()}>
                保存称呼
              </button>
            </form>
            <div className="mp-account-row">
              <span>手机号</span>
              <strong>{account?.phoneMasked || "—"}</strong>
            </div>
            <div className="mp-account-row">
              <span>账号 ID</span>
              <code>{account?.id || "—"}</code>
            </div>
          </>
        ) : tab === "security" ? (
          <>
            <h1>账号与安全</h1>
            <p className="mp-subtitle">管理登录状态与绑定信息。</p>
            <div className="mp-account-row">
              <span>绑定手机号</span>
              <strong>{account?.phoneMasked || "—"}</strong>
            </div>
            <div className="mp-account-row">
              <span>微信</span>
              <strong>{account?.wechatBound ? "已绑定" : "未绑定"}</strong>
            </div>
            <div className="mp-account-row">
              <span>
                退出当前账户<small>本地项目文件会保留。</small>
              </span>
              <button
                className="mp-secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await logout()
                    if (mounted.current) router.replace("/login")
                  })
                }
              >
                退出登录
              </button>
            </div>
            <p className="mp-hint">
              忘记密码时，可在登录页通过绑定的手机号找回。
            </p>
          </>
        ) : tab === "preferences" ? (
          <>
            <h1>工作台设置</h1>
            <p className="mp-subtitle">把工作台调整成你习惯的样子。</p>
            {settings.map(([section, label, description]) => (
              <button
                key={section}
                className="mp-settings-row"
                onClick={() => void run(() => openSettingsWindow(section))}
                disabled={busy}
              >
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </>
        ) : tab === "usage" ? (
          <>
            <h1>套餐与用量</h1>
            <p className="mp-subtitle">
              {demo ? "开发演示数据" : "查看最近更新的用量记录。"}
            </p>
            <div className="mp-account-row">
              <span>当前会员</span>
              <strong>
                {account?.tier === "pro"
                  ? "Pro"
                  : account?.tier === "free"
                    ? "Free"
                    : "—"}
              </strong>
            </div>
            {usageLoading ? (
              <p role="status">正在读取用量…</p>
            ) : usageError ? (
              <p className="mp-error" role="alert">
                {usageError}
                <button
                  className="mp-link"
                  onClick={() => setRetry((v) => v + 1)}
                >
                  重试
                </button>
              </p>
            ) : (
              usage && (
                <div className="mp-usage-summary">
                  <span>{usage.periodLabel}</span>
                  <p>
                    <strong>{usage.used.toLocaleString("zh-CN")}</strong> /{" "}
                    {usage.limit === null
                      ? "按实际使用计量"
                      : usage.limit.toLocaleString("zh-CN")}{" "}
                    {usage.unit}
                  </p>
                  {usage.limit !== null && (
                    <meter
                      min={0}
                      max={usage.limit}
                      value={Math.min(usage.used, usage.limit)}
                      aria-label="账户已用额度"
                    />
                  )}
                  <small>
                    更新时间：
                    {new Date(usage.updatedAt).toLocaleString("zh-CN")}
                  </small>
                  <button
                    className="mp-link"
                    onClick={() => setRetry((v) => v + 1)}
                  >
                    刷新记录
                  </button>
                </div>
              )
            )}
          </>
        ) : (
          <>
            <h1>隐私与权益</h1>
            <p className="mp-subtitle">阅读当前生效的政策与服务说明。</p>
            <Link href="/policies" className="mp-settings-row">
              隐私政策与权益声明 →
            </Link>
            <p className="mp-hint">
              项目随手记保存在当前设备，按账户与项目分开存放。
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="mp-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mp-notice">
            {notice}
          </p>
        )}
      </div>
    </section>
  )
}
export function MantapalAccountTitle() {
  return <div className="flex h-10 items-center px-4 text-sm">用户中心</div>
}
