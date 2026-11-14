import type { AccountService, MantapalAccount, WechatStatus } from "./contract"

/** Imported only in an explicitly opted-in development build. Never a fallback after a network error. */
export function createDemoAccountService(): AccountService {
  let account: MantapalAccount | null = null
  let password = "Mantapal123!"
  let scan: WechatStatus = { status: "waiting" }
  const make = (firstUse = false): MantapalAccount => ({
    id: "local-test",
    name: "Levi",
    phoneMasked: "138 **** 8000",
    tier: "free",
    firstUse,
    wechatBound: false,
  })
  const verify = (phone: string, code: string) => {
    if (phone !== "13800138000" || code !== "123456")
      throw new Error("测试手机号或验证码不正确。")
  }
  const login = (first = false) => {
    account = make(first)
    return account
  }
  return {
    async session() {
      return { account, csrfToken: "development-only" }
    },
    async policy() {
      return {
        version: "demo-2026-11",
        privacy:
          "开发演示政策：测试数据仅保留在当前页面内存中。此文案不能作为正式隐私政策发布。",
        rights:
          "开发演示权益声明：不发送短信、不读取微信、不扣费，也不会开通真实会员。",
      }
    },
    async password(name, value) {
      if (!["Levi", "13800138000"].includes(name) || value !== password)
        throw new Error("账号或密码不正确。")
      return login()
    },
    async sendCode(phone) {
      if (phone !== "13800138000")
        throw new Error("请使用测试手机号 13800138000。")
      return { retryAfter: 60 }
    },
    async phone(phone, code) {
      verify(phone, code)
      return login()
    },
    async register(input) {
      verify(input.phone, input.code)
      if (!input.accepted) throw new Error("请先阅读并同意政策。")
      password = input.password
      return login(true)
    },
    async wechat() {
      scan = { status: "phone_required", ticket: "demo-bind" }
      return {
        id: "demo",
        qrContent: "https://example.invalid/mantapal-demo",
        expiresAt: new Date(Date.now() + 180000).toISOString(),
      }
    },
    async wechatStatus() {
      return scan
    },
    async bindPhone(input) {
      verify(input.phone, input.code)
      if (input.ticket !== "demo-bind" || !input.accepted)
        throw new Error("授权已过期。")
      account = { ...make(true), wechatBound: true }
      return account
    },
    async verifyReset(phone, code) {
      verify(phone, code)
      return { ticket: "demo-reset" }
    },
    async resetPassword(ticket, value) {
      if (ticket !== "demo-reset") throw new Error("请重新验证手机号。")
      password = value
    },
    async updateName(name) {
      if (!account) throw new Error("请先登录。")
      account = { ...account, name, firstUse: false }
      return account
    },
    async usage() {
      return {
        used: 1280,
        limit: 10000,
        unit: "演示点数",
        periodLabel: "开发测试",
        updatedAt: new Date().toISOString(),
      }
    },
    async logout() {
      account = null
    },
  }
}
