import { z } from "zod"
import {
  accountSchema,
  sessionSchema,
  policySchema,
  usageSchema,
  challengeSchema,
  wechatStatusSchema,
  type AccountService,
} from "./contract"

export class AccountServiceError extends Error {
  constructor(
    message: string,
    public status = 0,
    public retryAfter = 0
  ) {
    super(message)
  }
}

/** Cookie sessions are issued and revoked by the service. No bearer token or password is persisted in the UI. */
export function createAccountClient(
  base = process.env.NEXT_PUBLIC_MANTAPAL_ACCOUNT_API || "/api/mantapal/v1",
  request: typeof fetch = fetch
): AccountService {
  let csrfToken = ""
  let sessionRevision = 0
  async function call<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(abort, 12000)
    try {
      if (body !== undefined && !csrfToken)
        throw new AccountServiceError("会话尚未就绪，请刷新后重试。")
      const response = await request(`${base.replace(/\/$/, "")}${path}`, {
        method: body === undefined ? "GET" : "POST",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken,
              }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (!response.ok) {
        const retryAfter = Math.min(
          300,
          Math.max(0, Number(response.headers.get("Retry-After")) || 0)
        )
        const message =
          response.status === 401
            ? "登录信息不正确或会话已过期，请重新登录。"
            : response.status === 429
              ? "操作有些频繁，请稍后再试。"
              : response.status === 404 || response.status === 501
                ? "账户服务尚未接通，请联系服务提供方。"
                : response.status === 400
                  ? "请检查填写的信息后重试。"
                  : "账户服务暂时不可用，请稍后重试。"
        throw new AccountServiceError(message, response.status, retryAfter)
      }
      const parsed = schema.safeParse(await response.json())
      if (!parsed.success)
        throw new AccountServiceError("服务返回的数据不完整，请稍后重试。")
      return parsed.data
    } catch (error) {
      if (error instanceof AccountServiceError) throw error
      if (signal?.aborted) throw error
      throw new AccountServiceError(
        controller.signal.aborted
          ? "请求超时，请重试。"
          : "连接失败，请检查网络后重试。"
      )
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
    }
  }
  const ok = z.object({ ok: z.literal(true) })
  async function session(signal?: AbortSignal) {
    const revision = ++sessionRevision
    const result = await call("/session", sessionSchema, undefined, signal)
    if (revision === sessionRevision) csrfToken = result.csrfToken
    return result
  }
  async function confirmSession(
    account: z.infer<typeof accountSchema>,
    signal?: AbortSignal
  ) {
    // Authentication may rotate both the HttpOnly cookie and the CSRF token.
    // Enter the workspace only after the new cookie is readable by the service.
    const current = await session(signal)
    if (!current.account || current.account.id !== account.id)
      throw new AccountServiceError(
        "登录会话未能保存，请检查浏览器设置后重试。"
      )
    return current.account
  }
  async function authenticate(path: string, body: unknown) {
    return confirmSession(await call(path, accountSchema, body))
  }
  return {
    session,
    policy: (signal) =>
      call("/policies/current", policySchema, undefined, signal),
    password: (account, password) =>
      authenticate("/login/password", { account, password }),
    sendCode: (phone, purpose) =>
      call("/otp", z.object({ retryAfter: z.number().int().min(1).max(300) }), {
        phone,
        purpose,
      }),
    phone: (phone, code) => authenticate("/login/phone", { phone, code }),
    register: (input) => authenticate("/register", input),
    wechat: (signal) => call("/wechat/challenge", challengeSchema, {}, signal),
    async wechatStatus(id, signal) {
      const status = await call(
        `/wechat/status?id=${encodeURIComponent(id)}`,
        wechatStatusSchema,
        undefined,
        signal
      )
      if (status.status === "authenticated")
        return {
          ...status,
          account: await confirmSession(status.account, signal),
        }
      return status
    },
    bindPhone: (input) => authenticate("/wechat/bind-phone", input),
    verifyReset: (phone, code) =>
      call("/password/verify", z.object({ ticket: z.string().min(1) }), {
        phone,
        code,
      }),
    async resetPassword(ticket, password) {
      await call("/password/reset", ok, { ticket, password })
      await session()
    },
    updateName: (name) => call("/profile", accountSchema, { name }),
    usage: (signal) => call("/usage", usageSchema, undefined, signal),
    async logout() {
      await call("/logout", ok, {})
      csrfToken = ""
      ++sessionRevision
    },
  }
}
