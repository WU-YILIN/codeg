"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import { useMantapalAccount } from "./account-provider"
import { BrandSplash, MantapalLogo } from "./brand"
import { AccountServiceError } from "./account-client"
import { authenticatedReturnPath } from "./login-return"
import {
  passwordIsValid,
  phoneIsValid,
  type MantapalAccount,
  type OtpPurpose,
  type Policy,
  type WechatChallenge,
} from "./contract"

type View =
  | "login"
  | "register"
  | "reset"
  | "setPassword"
  | "resetDone"
  | "bind"
  | "onboard"
type Method = "phone" | "password" | "wechat"
const loginMethods = [
  ["phone", "验证码登录"],
  ["password", "账号密码"],
  ["wechat", "微信扫码"],
] as const
export function MantapalAuthScreen() {
  const {
    service,
    account,
    loading,
    error: sessionError,
    demo: demoEnabled,
    refresh,
    signedIn,
  } = useMantapalAccount()
  const demo = process.env.NODE_ENV === "development" && demoEnabled
  const router = useRouter()
  const [view, setView] = useState<View>("login")
  const [method, setMethod] = useState<Method>("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [policyError, setPolicyError] = useState("")
  const [policyRetry, setPolicyRetry] = useState(0)
  const [ticket, setTicket] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(0)
  const [qr, setQr] = useState<WechatChallenge | null>(null)
  const [qrExpired, setQrExpired] = useState(false)
  const [qrRetry, setQrRetry] = useState(0)
  const methodTabs = useRef<Partial<Record<Method, HTMLButtonElement | null>>>(
    {}
  )
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const countdown = Math.max(0, Math.ceil((resendAt - now) / 1000))
  useEffect(() => {
    if (account) {
      if (account.firstUse) {
        setView("onboard")
        setName(account.name)
      } else router.replace(authenticatedReturnPath(window.location.search))
    }
  }, [account, router])
  useEffect(() => {
    if (!service) return
    const controller = new AbortController()
    setPolicyError("")
    void service
      .policy(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setPolicy(value)
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPolicyError("政策内容暂时加载失败，请重试。")
      })
    return () => controller.abort()
  }, [service, policyRetry])
  useEffect(() => {
    if (
      !service ||
      loading ||
      sessionError ||
      view !== "login" ||
      method !== "wechat"
    )
      return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    setQr(null)
    setQrExpired(false)
    setError("")
    const poll = async (challenge: WechatChallenge) => {
      if (abort.signal.aborted) return
      if (Date.now() >= Date.parse(challenge.expiresAt)) {
        setQrExpired(true)
        return
      }
      try {
        const result = await service.wechatStatus(challenge.id, abort.signal)
        if (abort.signal.aborted) return
        if (result.status === "authenticated") {
          signedIn(result.account)
          return
        }
        if (result.status === "phone_required") {
          setTicket(result.ticket)
          setAccepted(false)
          setPhone("")
          setCode("")
          setView("bind")
          return
        }
        if (result.status === "expired") {
          setQrExpired(true)
          return
        }
        timer = setTimeout(() => void poll(challenge), 2000)
      } catch (cause) {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "扫码状态获取失败，请重试。"
          )
      }
    }
    void service
      .wechat(abort.signal)
      .then((challenge) => {
        if (!abort.signal.aborted) {
          setQr(challenge)
          timer = setTimeout(() => void poll(challenge), 2000)
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(cause instanceof Error ? cause.message : "二维码加载失败。")
      })
    return () => {
      abort.abort()
      clearTimeout(timer)
    }
  }, [service, loading, sessionError, view, method, qrRetry, signedIn])
  function changeView(next: View) {
    setView(next)
    setError("")
    setNotice("")
    setPassword("")
    setConfirmation("")
    setCode("")
    setAccepted(false)
    if (next === "login") setTicket("")
  }
  function selectMethod(next: Method, focus = false) {
    if (busy) return
    setMethod(next)
    setError("")
    setPassword("")
    setNotice("")
    if (focus) methodTabs.current[next]?.focus()
  }
  async function run(action: () => Promise<void>) {
    if (busy || !service) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await action()
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : "操作失败，请重试。")
        if (cause instanceof AccountServiceError && cause.retryAfter)
          setResendAt(Date.now() + cause.retryAfter * 1000)
      }
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  function complete(value: MantapalAccount) {
    if (mounted.current) {
      setPassword("")
      setConfirmation("")
      signedIn(value)
    }
  }
  const purpose: OtpPurpose =
    view === "register"
      ? "register"
      : view === "reset"
        ? "reset"
        : view === "bind"
          ? "bind"
          : "login"
  async function sendCode() {
    if (!phoneIsValid(phone)) {
      setError("请输入正确的 11 位手机号。")
      return
    }
    await run(async () => {
      const result = await service!.sendCode(phone, purpose)
      setResendAt(Date.now() + result.retryAfter * 1000)
      setNotice(demo ? "测试验证码：123456" : "验证码已发送，请留意短信。")
    })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      if (view === "onboard") {
        if (!name.trim()) throw new Error("写一个希望我们称呼你的名字。")
        complete(await service!.updateName(name.trim()))
        return
      }
      if (view === "setPassword") {
        if (!passwordIsValid(password))
          throw new Error(
            "密码需为 8–32 位，同时包含英文字母和数字，不能包含空格。"
          )
        if (password !== confirmation) throw new Error("两次输入的密码不一致。")
        await service!.resetPassword(ticket, password)
        setTicket("")
        setPassword("")
        setConfirmation("")
        setView("resetDone")
        return
      }
      if (view === "login" && method === "password") {
        complete(await service!.password(username.trim(), password))
        return
      }
      if (!phoneIsValid(phone) || !/^\d{6}$/.test(code))
        throw new Error("请填写正确的手机号和 6 位验证码。")
      if (view === "reset") {
        const result = await service!.verifyReset(phone, code)
        setTicket(result.ticket)
        setCode("")
        setView("setPassword")
        return
      }
      if (view === "register" || view === "bind") {
        if (!accepted || !policy)
          throw new Error("请阅读并同意隐私政策与权益声明。")
        if (view === "bind") {
          complete(
            await service!.bindPhone({
              ticket,
              phone,
              code,
              policyVersion: policy.version,
              accepted: true,
            })
          )
          return
        }
        if (!passwordIsValid(password))
          throw new Error(
            "密码需为 8–32 位，同时包含英文字母和数字，不能包含空格。"
          )
        complete(
          await service!.register({
            phone,
            code,
            password,
            policyVersion: policy.version,
            accepted: true,
          })
        )
        return
      }
      complete(await service!.phone(phone, code))
    })
  }
  const disabled = busy || loading || !!sessionError || !service
  const agreement = (
    <div className="mp-agreement">
      {policy ? (
        <>
          <details>
            <summary>隐私政策</summary>
            <p>{policy.privacy}</p>
          </details>
          <details>
            <summary>权益声明</summary>
            <p>{policy.rights}</p>
          </details>
          <label className="mp-checkbox">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={busy}
            />
            我已阅读并同意隐私政策与权益声明
          </label>
        </>
      ) : (
        <p role="status">
          {policyError || "正在加载政策内容…"}
          {policyError && (
            <button
              type="button"
              className="mp-link"
              onClick={() => setPolicyRetry((v) => v + 1)}
            >
              重新加载
            </button>
          )}
        </p>
      )}
    </div>
  )
  const phoneFields = (
    <>
      <label className="mp-field">
        手机号码
        <div className="mp-input-group">
          <span>+86</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel-national"
            type="tel"
            inputMode="numeric"
            maxLength={11}
            required
            disabled={busy}
            aria-label="手机号码"
            placeholder="请输入手机号"
          />
        </div>
      </label>
      <label className="mp-field">
        验证码
        <div className="mp-input-group">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            disabled={busy}
            aria-label="验证码"
            placeholder="6 位短信验证码"
          />
          <button
            type="button"
            className="mp-link"
            onClick={() => void sendCode()}
            disabled={disabled || countdown > 0 || !phoneIsValid(phone)}
          >
            {countdown ? `${countdown} 秒后重发` : "获取验证码"}
          </button>
        </div>
      </label>
    </>
  )
  const passwordField = (
    <label className="mp-field">
      {view === "setPassword" ? "新密码" : "密码"}
      <input
        className="mp-input"
        aria-label={view === "setPassword" ? "新密码" : "密码"}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={view === "login" ? "current-password" : "new-password"}
        maxLength={32}
        required
        disabled={busy}
      />
    </label>
  )
  if (loading) return <BrandSplash />
  const title = {
    login: "回到工作台",
    register: "创建你的账号",
    reset: "找回密码",
    setPassword: "设置新密码",
    resetDone: "密码已更新",
    bind: "绑定手机号码",
    onboard: "先认识一下",
  }[view]
  return (
    <main className="mp-auth">
      <header>
        <MantapalLogo />
      </header>
      <section className="mp-auth-body">
        {view !== "login" && view !== "onboard" && (
          <button
            type="button"
            className="mp-back"
            disabled={busy}
            onClick={() => {
              changeView("login")
              setMethod("password")
            }}
          >
            ← 返回登录
          </button>
        )}
        <p className="mp-eyebrow">你的 Mantapal 工作空间</p>
        <h1>{title}</h1>
        <p className="mp-subtitle">
          {view === "login"
            ? "选一种熟悉的方式登录。"
            : view === "onboard"
              ? "留个称呼就好，其他的可以以后再说。"
              : view === "bind"
                ? "首次使用微信登录，需要验证并绑定手机号。"
                : view === "reset"
                  ? "先验证绑定的手机号。"
                  : view === "register"
                    ? "创建前，请先阅读隐私政策与权益声明。"
                    : view === "resetDone"
                      ? "使用新密码登录，即可继续之前的工作。"
                      : "设置一个新的登录密码。"}
        </p>
        {sessionError && (
          <div className="mp-error" role="alert">
            {sessionError}
            <button
              className="mp-link"
              type="button"
              onClick={() => void refresh()}
            >
              重新连接
            </button>
          </div>
        )}
        {view === "login" && (
          <div className="mp-auth-tabs" role="tablist" aria-label="登录方式">
            {loginMethods.map(([id, label], index) => (
              <button
                type="button"
                key={id}
                id={`mantapal-login-tab-${id}`}
                ref={(element) => {
                  methodTabs.current[id] = element
                }}
                role="tab"
                aria-selected={method === id}
                aria-controls="mantapal-login-panel"
                tabIndex={method === id ? 0 : -1}
                disabled={busy}
                onClick={() => selectMethod(id)}
                onKeyDown={(event) => {
                  if (busy) return
                  let next: number
                  if (event.key === "ArrowRight")
                    next = (index + 1) % loginMethods.length
                  else if (event.key === "ArrowLeft")
                    next =
                      (index - 1 + loginMethods.length) % loginMethods.length
                  else if (event.key === "Home") next = 0
                  else if (event.key === "End") next = loginMethods.length - 1
                  else return
                  event.preventDefault()
                  selectMethod(loginMethods[next][0], true)
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div
          id={view === "login" ? "mantapal-login-panel" : undefined}
          role={view === "login" ? "tabpanel" : undefined}
          aria-labelledby={
            view === "login" ? `mantapal-login-tab-${method}` : undefined
          }
        >
          {view === "login" && method === "wechat" ? (
            <section className="mp-wechat">
              {qr && !qrExpired && !sessionError && !error ? (
                <QRCodeSVG
                  value={qr.qrContent}
                  size={184}
                  level="M"
                  marginSize={2}
                  title="微信登录二维码"
                />
              ) : (
                <div className="mp-qr-placeholder">
                  {sessionError || error
                    ? "二维码暂时不可用"
                    : qrExpired
                      ? "二维码已过期"
                      : "正在获取二维码…"}
                </div>
              )}
              <p>
                {sessionError || error
                  ? "连接恢复后，可以重新获取二维码。"
                  : qrExpired
                    ? "刷新二维码后，再用微信扫一扫。"
                    : demo
                      ? "开发演示：将进入手机号绑定流程。"
                      : "用微信扫一扫，在手机上确认登录。"}
              </p>
              <button
                type="button"
                className="mp-link"
                disabled={disabled}
                onClick={() => setQrRetry((v) => v + 1)}
              >
                刷新二维码
              </button>
            </section>
          ) : view === "resetDone" ? (
            <button
              type="button"
              className="mp-primary"
              onClick={() => {
                changeView("login")
                setMethod("password")
              }}
            >
              返回账号密码登录
            </button>
          ) : (
            <form onSubmit={(event) => void submit(event)} aria-label={title}>
              {view === "onboard" ? (
                <label className="mp-field">
                  怎么称呼你
                  <input
                    className="mp-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={30}
                    autoComplete="nickname"
                  />
                </label>
              ) : view === "login" && method === "password" ? (
                <label className="mp-field">
                  账号 / 手机号
                  <input
                    className="mp-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    disabled={busy}
                  />
                </label>
              ) : view !== "setPassword" ? (
                phoneFields
              ) : null}
              {(view === "register" ||
                view === "setPassword" ||
                (view === "login" && method === "password")) && (
                <>
                  {passwordField}
                  {view === "setPassword" && (
                    <label className="mp-field">
                      再次输入密码
                      <input
                        className="mp-input"
                        type={showPassword ? "text" : "password"}
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        autoComplete="new-password"
                        required
                        disabled={busy}
                        maxLength={32}
                      />
                    </label>
                  )}
                  <div className="mp-password-actions">
                    <label className="mp-checkbox">
                      <input
                        type="checkbox"
                        checked={showPassword}
                        onChange={(e) => setShowPassword(e.target.checked)}
                      />
                      显示密码
                    </label>
                    {view === "login" && (
                      <button
                        type="button"
                        className="mp-link"
                        disabled={busy}
                        onClick={() => changeView("reset")}
                      >
                        忘记密码？
                      </button>
                    )}
                  </div>
                </>
              )}
              {(view === "register" || view === "bind") && agreement}
              <button
                className="mp-primary"
                type="submit"
                disabled={
                  disabled ||
                  ((view === "register" || view === "bind") &&
                    (!accepted || !policy))
                }
              >
                {busy
                  ? "请稍候…"
                  : view === "register"
                    ? "同意并创建账号"
                    : view === "bind"
                      ? "同意并绑定手机号"
                      : view === "reset"
                        ? "验证并继续"
                        : view === "setPassword"
                          ? "更新密码"
                          : view === "onboard"
                            ? "进入工作台"
                            : "登录 Mantapal"}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          )}
        </div>
        {error && (
          <p className="mp-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="mp-notice" role="status">
            {notice}
          </p>
        )}
        {view === "login" && (
          <>
            <p className="mp-register">
              还没有账号？
              <button
                type="button"
                className="mp-link"
                disabled={busy}
                onClick={() => changeView("register")}
              >
                创建账号
              </button>
            </p>
            {demo && (
              <div className="mp-demo">
                <p>
                  开发测试 · Levi / Mantapal123!
                  <br />
                  手机号 13800138000 · 验证码 123456
                </p>
                <button
                  type="button"
                  className="mp-secondary"
                  disabled={disabled}
                  onClick={() =>
                    void run(async () =>
                      complete(await service!.phone("13800138000", "123456"))
                    )
                  }
                >
                  一键进入测试工作台 ↗
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <footer>
        © {new Date().getFullYear()} Mantapal{" "}
        <Link href="/policies">隐私政策与权益声明</Link>
      </footer>
    </main>
  )
}
