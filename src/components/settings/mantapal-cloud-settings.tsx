"use client"

import { useCallback, useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ExternalLink, RefreshCw, Cloud } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isLocalDesktop } from "@/lib/platform"

interface Status {
  logged_in: boolean
  base_url: string
  user?: { email?: string; username?: string; balance?: number }
  usage?: { total_requests?: number; total_actual_cost?: number } | null
  subscriptions?: unknown
  groups?: Array<{ id: number; name: string; platform: string }>
}
interface LoginResult { requires_2fa: boolean; temp_token?: string }
interface ImportResult { provider_id: number; key_id: number; name: string }
const TARGETS = [{ id: "claude_code", label: "Claude Code" }, { id: "codex", label: "Codex" }, { id: "gemini", label: "Gemini CLI" }] as const
function errorText(error: unknown) { return typeof error === "string" ? error : error instanceof Error ? error.message : "操作失败" }
function openExternal(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && parsed.hostname === "localhost")) throw new Error("仅支持 HTTPS 链接")
    void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url)).catch(e => toast.error(errorText(e)))
  } catch (error) { toast.error(errorText(error)) }
}
export function MantapalCloudSettings() {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => setDesktop(isLocalDesktop()), [])
  const [status, setStatus] = useState<Status | null>(null)
  const [baseUrl, setBaseUrl] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [tempToken, setTempToken] = useState("")
  const [code, setCode] = useState("")
  const [agent, setAgent] = useState<"claude_code" | "codex" | "gemini">("claude_code")
  const [groupId, setGroupId] = useState("")
  const [model, setModel] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const refresh = useCallback(async () => {
    if (!desktop) return
    const result = await invoke<Status>("mantapal_beta_status")
    setStatus(result)
    if (result.base_url) setBaseUrl(result.base_url)
    setGroupId(current => (result.groups ?? []).some(g => String(g.id) === current) ? current : String(result.groups?.[0]?.id ?? ""))
  }, [desktop])
  useEffect(() => { if (desktop) void refresh().catch(e => setError(errorText(e))) }, [desktop, refresh])
  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    setBusy(true)
    setError("")
    try { return await task() } catch (e) { setError(errorText(e)); return undefined } finally { setBusy(false) }
  }
  async function login() {
    const result = await run(() => invoke<LoginResult>("mantapal_beta_login", { baseUrl, email, password }))
    setPassword("")
    if (!result) return
    if (result.requires_2fa) { setTempToken(result.temp_token ?? ""); toast.info("请输入两步验证码"); return }
    toast.success("已登录 Mantapal Cloud")
    void refresh().catch(e => setError(errorText(e)))
  }
  async function login2fa() {
    const result = await run(() => invoke<LoginResult>("mantapal_beta_login_2fa", { baseUrl, tempToken, totpCode: code }))
    setCode("")
    if (!result) return
    setTempToken("")
    toast.success("两步验证成功")
    void refresh().catch(e => setError(errorText(e)))
  }
  async function logout() {
    const result = await run(async () => { await invoke<void>("mantapal_beta_logout"); await refresh(); return true })
    if (result) toast.success("已退出账户；已导入的模型密钥不会自动撤销")
  }
  async function importProvider() {
    const result = await run(() => invoke<ImportResult>("mantapal_beta_import_provider", { agentType: agent, groupId: Number(groupId), model }))
    if (result) toast.success("已导入 Provider，请在 Agent 设置中手动启用")
  }
  const root = (status?.base_url || baseUrl.trim()).replace(/\/(api\/v1|v1beta|v1)\/?$/, "").replace(/\/+$/, "")
  const loggedIn = Boolean(status?.logged_in)
  return <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Cloud className="h-5 w-5" />Mantapal Cloud</h1>
        <p className="text-sm text-muted-foreground">连接模型服务账户，查询余额与消费，创建独立 Provider。不会自动覆盖已有 Agent 或 BYOK 配置。</p>
      </header>
      {!desktop ? <div className="rounded-lg border p-4 text-sm">快速内测版仅支持本地桌面工作区，Web 和远程工作区暂不开放。</div> : <>
        <section className="space-y-4 rounded-lg border p-5">
          <h2 className="font-semibold">账户管理</h2>
          {!loggedIn ? <>
            <div className="space-y-2">
              <Label htmlFor="m-cloud-url">Sub2API 账户站点地址</Label>
              <Input id="m-cloud-url" placeholder="https://your-sub2api.example.com" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} disabled={busy || !!tempToken} />
              <p className="text-xs text-muted-foreground">填写账户网站根地址；不是某个模型请求路径。远程服务要求 HTTPS。</p>
            </div>
            {!tempToken ? <>
              <div className="space-y-2"><Label htmlFor="m-email">邮箱</Label><Input id="m-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></div>
              <div className="space-y-2"><Label htmlFor="m-password">密码</Label><Input id="m-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} onKeyDown={e => { if (e.key === "Enter") void login() }} /></div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void login()} disabled={busy || !baseUrl.trim() || !email || !password}>登录</Button>
                <Button variant="outline" disabled={!root} onClick={() => openExternal(root + "/register")}>注册 <ExternalLink className="ml-1 h-3 w-3" /></Button>
              </div>
            </> : <>
              <p className="text-sm text-muted-foreground">账户启用了两步验证，请输入六位动态验证码。</p>
              <div className="space-y-2"><Label htmlFor="m-totp">验证码</Label><Input id="m-totp" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} disabled={busy} onKeyDown={e => { if (e.key === "Enter") void login2fa() }} /></div>
              <div className="flex gap-2"><Button onClick={() => void login2fa()} disabled={busy || code.length !== 6}>完成登录</Button><Button variant="outline" onClick={() => { setTempToken(""); setCode("") }}>取消</Button></div>
            </>}
          </> : <>
            <p className="text-sm">已登录：{status?.user?.email ?? status?.user?.username ?? "当前用户"}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">账户余额 USD</p><p className="mt-1 text-lg font-semibold tabular-nums">{typeof status?.user?.balance === "number" ? status.user.balance.toFixed(4) : "—"}</p></div>
              <div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">累计实际扣费 USD</p><p className="mt-1 text-lg font-semibold tabular-nums">{typeof status?.usage?.total_actual_cost === "number" ? status.usage.total_actual_cost.toFixed(4) : "—"}</p></div>
              <div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">累计请求</p><p className="mt-1 text-lg font-semibold tabular-nums">{status?.usage?.total_requests ?? "—"}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => openExternal(root + "/purchase")}>充值／购买 <ExternalLink className="ml-1 h-3 w-3" /></Button>
              <Button variant="outline" onClick={() => openExternal(root + "/usage")}>消费明细 <ExternalLink className="ml-1 h-3 w-3" /></Button>
              <Button variant="outline" disabled={busy} onClick={() => void run(refresh)}><RefreshCw className="mr-1 h-3 w-3" />刷新</Button>
              <Button variant="ghost" disabled={busy} onClick={() => void logout()}>退出账户</Button>
            </div>
          </>}
        </section>
        {loggedIn && <section className="space-y-4 rounded-lg border p-5">
          <h2 className="font-semibold">导入 Mantapal Cloud</h2>
          <p className="text-xs text-muted-foreground">新建当前用户的专属 API Key 和 Model Provider，不会自动绑定 Agent。仅在确认服务分组支持所选 Agent 与协议后使用。</p>
          <div className="space-y-2"><Label htmlFor="m-agent">目标 Agent</Label><select id="m-agent" className="w-full rounded-md border bg-background p-2 text-sm" value={agent} onChange={e => setAgent(e.target.value as typeof agent)} disabled={busy}>{TARGETS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="m-group">模型分组</Label><select id="m-group" className="w-full rounded-md border bg-background p-2 text-sm" value={groupId} onChange={e => setGroupId(e.target.value)} disabled={busy}>{(status?.groups ?? []).map(x => <option key={x.id} value={x.id}>{x.name} · {x.platform}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="m-model">模型 ID（可选）</Label><Input id="m-model" value={model} placeholder="留空使用 Agent 自己的模型选择" onChange={e => setModel(e.target.value)} disabled={busy} /></div>
          <Button disabled={busy || !groupId} onClick={() => void importProvider()}>创建 API Key 并导入 Provider</Button>
          <p className="text-xs text-muted-foreground">之后前往「Settings → Agents」，选择刚导入的 Model Provider。退出账户不会自动撤销已创建的网关 API Key。</p>
        </section>}
        {error && <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</div>}
      </>}
    </div>
  </div>
}
