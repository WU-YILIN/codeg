"use client"

import { useCallback, useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { useRouter } from "next/navigation"
import { BadgeCheck, ExternalLink, RefreshCw, UserRound } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isLocalDesktop } from "@/lib/platform"
import {
  parseMantapalMembership,
  type MantapalMembership,
} from "@/lib/mantapal-membership"

type AccountConfig = {
  configured: boolean
  origin?: string
  register_url?: string
  login_url?: string
  message?: string
}

type AccountStatus = {
  authenticated: boolean
  user?: { id?: number; username?: string; email?: string; balance?: number }
  membership?: unknown
  membership_error?: string
}

type LoginResult = {
  requires_2fa: boolean
  temp_token?: string
}

type TrialActivationResult = {
  agent_type: string
  provider_id: number
  affected_running_sessions: number
}

function describeError(value: unknown): string {
  return typeof value === "string"
    ? value
    : value instanceof Error
      ? value.message
      : "账户服务暂时不可用"
}

async function openAccountUrl(value?: string): Promise<void> {
  if (!value) return
  const parsed = new URL(value)
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) {
    throw new Error("只允许打开 HTTPS 账户页面")
  }
  await openUrl(value)
}

export function MantapalAccountSettings() {
  const router = useRouter()
  const [desktop, setDesktop] = useState<boolean | null>(null)
  const [config, setConfig] = useState<AccountConfig | null>(null)
  const [account, setAccount] = useState<AccountStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [tempToken, setTempToken] = useState("")
  const [totp, setTotp] = useState("")
  const [trialAgent, setTrialAgent] = useState<"codex" | "claude_code" | "gemini">("codex")
  const [allowReplace, setAllowReplace] = useState(false)
  const [trialResult, setTrialResult] = useState<TrialActivationResult | null>(null)

  const refresh = useCallback(async () => {
    try {
      const status = await invoke<AccountStatus>("mantapal_account_status")
      setAccount(status)
      const available = parseMantapalMembership(status.membership)?.managed_agents ?? []
      setTrialAgent((current) =>
        available.includes(current) ? current :
        (available[0] as "codex" | "claude_code" | "gemini" | undefined) ?? "codex"
      )
    } catch (cause) {
      // Never keep displaying a stale membership when account verification fails.
      setAccount(null)
      throw cause
    }
  }, [])

  useEffect(() => {
    setDesktop(isLocalDesktop())
  }, [])

  useEffect(() => {
    if (desktop === null) return
    if (!desktop) {
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false
    const load = async () => {
      try {
        const data = await invoke<AccountConfig>("mantapal_account_config")
        if (cancelled) return
        setConfig(data)
        if (data.configured) await refresh()
      } catch (cause) {
        if (!cancelled) setError(describeError(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [desktop, refresh])

  async function action<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true)
    setError("")
    try {
      return await work()
    } catch (cause) {
      setError(describeError(cause))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  async function login() {
    const result = await action(async () => {
      const reply = await invoke<LoginResult>("mantapal_account_login", {
        email,
        password,
      })
      if (!reply.requires_2fa) await refresh()
      return reply
    })
    setPassword("")
    if (!result) return
    if (result.requires_2fa) {
      setTempToken(result.temp_token ?? "")
      toast.info("请输入两步验证码")
    } else {
      toast.success("登录成功")
    }
  }

  async function login2fa() {
    const result = await action(async () => {
      await invoke<void>("mantapal_account_login_2fa", {
        tempToken,
        totpCode: totp,
      })
      await refresh()
      return true
    })
    setTotp("")
    if (result) {
      setTempToken("")
      toast.success("登录成功")
    }
  }

  async function logout() {
    const result = await action(async () => {
      await invoke<void>("mantapal_account_logout")
      setAccount({ authenticated: false })
      setTempToken("")
      return true
    })
    if (result) toast.success("已退出 Mantapal 账户，本地 Agent 配置保持不变")
  }

  async function openWebsite(link?: string) {
    await action(async () => {
      await openAccountUrl(link)
      return true
    })
  }

  async function activateTrial() {
    const result = await action(async () => {
      return invoke<TrialActivationResult>("mantapal_account_activate_trial", {
        agentType: trialAgent,
        allowReplace,
      })
    })
    if (!result) return
    setTrialResult(result)
    toast.success("Mantapal 免费试用已连接到所选 Agent")
    if (result.affected_running_sessions > 0) {
      toast.info("已有会话需要重启后才能使用新配置")
    }
  }

  const membership: MantapalMembership | null =
    parseMantapalMembership(account?.membership)
  const signedIn = account?.authenticated === true
  const needsVerification = Boolean(account?.membership_error) || (signedIn && !membership)
  const trialAvailable = membership?.entitlements.managed_trial === true
  const managedTrialAgents = membership?.managed_agents ?? []
  const trialWalletBalance = account?.user?.balance ?? 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-5 py-8">
        <header className="space-y-2">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <UserRound className="h-5 w-5" />
            Mantapal 账户
          </h1>
          <p className="text-sm text-muted-foreground">
            Mantapal Free 内置模型连接服务，注册后可使用赠送的试用额度；你也可以随时选择自己的 API Key 和 Base URL。
          </p>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">正在读取账户状态…</p>
        ) : !desktop ? (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            账户功能目前仅开放给本地桌面客户端，Web 和远程工作区仍可使用原有功能。
          </div>
        ) : !config?.configured ? (
          <div className="space-y-2 rounded-lg border p-5">
            <p className="font-medium">账户服务尚未接入</p>
            <p className="text-sm text-muted-foreground">
              {config?.message ?? "请在发行构建时配置 Mantapal 的账户服务地址。"}
            </p>
            <p className="text-sm text-muted-foreground">
              这不会影响已安装的 Agent、模型配置或本地工作区。
            </p>
          </div>
        ) : (
          <>
            <section className="space-y-4 rounded-lg border p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">软件会员</h2>
                {membership && !needsVerification ? (
                  <Badge variant="secondary" className="gap-1">
                    <BadgeCheck className="h-3 w-3" />
                    {membership.tier === "free" ? "Free" : "Pro"}
                  </Badge>
                ) : (
                  <Badge variant="outline">{signedIn ? "待验证" : "未登录"}</Badge>
                )}
              </div>

              {signedIn ? (
                <>
                  <p className="text-sm">
                    当前账户：{account.user?.email ?? account.user?.username ?? "已登录用户"}
                  </p>
                  {membership?.tier === "free" && membership.status === "active" && (
                    <div className="rounded-md bg-muted/50 p-4">
                      <p className="font-semibold">Mantapal Free</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        已激活。默认提供 Mantapal 模型试用服务；BYOK 可以继续使用。
                      </p>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">模型账户可用余额：<span className="font-semibold tabular-nums">{typeof account.user?.balance === "number" ? account.user.balance.toFixed(4) : "—"} USD</span>。新用户赠额来自服务端注册赠送设置，账户余额可能同时包含其他充值资金。</p>
                  {needsVerification && (
                    <p className="rounded-md border border-amber-500/30 p-3 text-sm text-muted-foreground">
                      {account.membership_error ??
                        "会员响应尚未通过验证。请检查账户服务器是否部署了 Free 会员接口。"}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={busy} onClick={() => void action(refresh)}>
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />刷新会员状态
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => void logout()}>
                      退出登录
                    </Button>
                  </div>
                </>
              ) : tempToken ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    请完成账户的两步验证。
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="mantapal-totp">六位验证码</Label>
                    <Input
                      id="mantapal-totp"
                      value={totp}
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) => setTotp(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void login2fa() }}
                      disabled={busy}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={busy || totp.length !== 6} onClick={() => void login2fa()}>
                      完成登录
                    </Button>
                    <Button variant="outline" onClick={() => { setTempToken(""); setTotp("") }}>
                      取消
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="mantapal-email">邮箱</Label>
                    <Input
                      id="mantapal-email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mantapal-password">密码</Label>
                    <Input
                      id="mantapal-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void login() }}
                      disabled={busy}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy || !email.trim() || !password}
                      onClick={() => void login()}
                    >
                      登录
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={() => void openWebsite(config.register_url)}>
                      免费注册 <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    注册在官方账户网站完成；如果启用了图形验证码，当前桌面登录暂不支持直接完成该验证。
                  </p>
                </>
              )}
            </section>

            {signedIn && membership?.tier === "free" && membership.status === "active" && (
              <section className="space-y-3 rounded-lg border p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Mantapal 免费模型试用</h2>
                  <Badge variant="secondary">内置服务</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  不必填写 API Key / Base URL。选择 Agent 后，Mantapal 会从服务端领取当前账户专属的有限额凭据并完成配置。
                  试用消费由模型服务账本扣除，不会使用公共共享密钥。
                </p>
                <div className="space-y-2">
                  <Label htmlFor="mantapal-trial-agent">试用 Agent</Label>
                  <select
                    id="mantapal-trial-agent"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={trialAgent}
                    disabled={busy}
                    onChange={(event) => { setTrialAgent(event.target.value as typeof trialAgent); setTrialResult(null) }}
                  >
                    {managedTrialAgents.includes("codex") && <option value="codex">Codex</option>}
                    {managedTrialAgents.includes("claude_code") && <option value="claude_code">Claude Code</option>}
                    {managedTrialAgents.includes("gemini") && <option value="gemini">Gemini CLI</option>}
                  </select>
                </div>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="mt-0.5" checked={allowReplace}
                    onChange={(event) => setAllowReplace(event.target.checked)} />
                  如果此 Agent 已经绑定其他模型服务，确认切换到 Mantapal Free。原有 Provider 不会被删除。
                </label>
                {!trialAvailable && (
                  <p className="text-sm text-muted-foreground">当前试用模型尚未由服务端启用，请检查 Free 模型配置。</p>
                )}
                {trialWalletBalance <= 0 && trialAvailable && (
                  <p className="text-sm text-muted-foreground">当前账户可用余额为 0，尚不能消耗免费试用额度。赠额需要由服务端在注册时发放。</p>
                )}
                <Button onClick={() => void activateTrial()} disabled={busy || !trialAvailable || trialWalletBalance <= 0}>
                  一键启用免费试用
                </Button>
                {trialResult && (
                  <p className="text-xs text-muted-foreground">
                    已连接 {trialResult.agent_type}。本次使用的是当前账户的专属试用凭据，不会在界面展示密钥。
                  </p>
                )}
              </section>
            )}

            <section className="space-y-3 rounded-lg border p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">使用自己的模型服务</h2>
                <Badge variant="outline">BYOK · 可选</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                如需接入自己的提供商，可以继续手动填写 API Key、Base URL 和模型；与赠送试用额度相互独立。
              </p>
              <Button variant="outline" onClick={() => router.push("/settings/model-providers")}>
                配置自己的 Model Provider
              </Button>
            </section>

            <section className="space-y-2 rounded-lg border border-dashed p-5">
              <h2 className="font-semibold">未来的 Pro 会员</h2>
              <p className="text-sm text-muted-foreground">
                Pro 权益、定价和订阅方式尚未确定，也没有开放购买。当前 Free 版本不会限制现有 Agent 功能。
              </p>
            </section>
          </>
        )}
        {error && (
          <div role="alert" className="space-y-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            <p>{error}</p>
            {account === null && desktop && config?.configured && (
              <Button variant="outline" disabled={busy} onClick={() => void logout()}>
                清除本地账户会话
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
