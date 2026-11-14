import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAccountClient } from "./account-client"

const account = {
  id: "a1",
  name: "Levi",
  phoneMasked: "138 **** 8000",
  tier: "free",
  firstUse: false,
  wechatBound: false,
}
const reply = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers })
let request: ReturnType<typeof vi.fn<typeof fetch>>
beforeEach(() => {
  request = vi.fn<typeof fetch>()
  localStorage.clear()
  sessionStorage.clear()
})

describe("Mantapal account service", () => {
  it("requires the anonymous CSRF session before sending credentials", async () => {
    const client = createAccountClient("/account", request)
    await expect(client.password("Levi", "secret")).rejects.toThrow(
      "会话尚未就绪"
    )
    expect(request).not.toHaveBeenCalled()
  })
  it("uses cookie credentials and rotates CSRF after authentication without storing secrets", async () => {
    request
      .mockResolvedValueOnce(reply({ account: null, csrfToken: "anonymous" }))
      .mockResolvedValueOnce(reply(account))
      .mockResolvedValueOnce(reply({ account, csrfToken: "rotated" }))
      .mockResolvedValueOnce(reply({ ...account, name: "小吴" }))
    const client = createAccountClient("/account/", request)
    await client.session()
    await expect(client.password("Levi", "secret123")).resolves.toEqual(account)
    await client.updateName("小吴")
    expect(request.mock.calls[1]).toEqual([
      "/account/login/password",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "anonymous" }),
      }),
    ])
    expect(request.mock.calls[3][1]?.headers).toMatchObject({
      "X-CSRF-Token": "rotated",
    })
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })
  it("refuses login if the server does not retain the authenticated cookie", async () => {
    request
      .mockResolvedValueOnce(reply({ account: null, csrfToken: "a" }))
      .mockResolvedValueOnce(reply(account))
      .mockResolvedValueOnce(reply({ account: null, csrfToken: "b" }))
    const client = createAccountClient("/account", request)
    await client.session()
    await expect(client.phone("13800138000", "123456")).rejects.toThrow(
      "登录会话未能保存"
    )
  })
  it("rejects malformed entitlements and never substitutes demo quota", async () => {
    request.mockResolvedValue(reply({ used: -1, limit: 100 }))
    await expect(
      createAccountClient("/account", request).usage()
    ).rejects.toThrow("数据不完整")
  })
  it("keeps server errors out of UI and respects bounded rate limits", async () => {
    request.mockResolvedValue(
      reply({ error: "<script>server internals</script>" }, 429, {
        "Retry-After": "900",
      })
    )
    await expect(
      createAccountClient("/account", request).usage()
    ).rejects.toMatchObject({
      status: 429,
      retryAfter: 300,
      message: "操作有些频繁，请稍后再试。",
    })
  })
  it("does not fall back to demo when the account API is absent", async () => {
    request.mockResolvedValue(reply({}, 404))
    await expect(
      createAccountClient("/account", request).session()
    ).rejects.toThrow("尚未接通")
  })
  it("cancels polling requests when the user leaves the login method", async () => {
    request.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          )
        )
    )
    const abort = new AbortController()
    const result = createAccountClient("/account", request).wechatStatus(
      "scan id",
      abort.signal
    )
    abort.abort()
    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(request.mock.calls[0][0]).toBe("/account/wechat/status?id=scan%20id")
  })
  it("clears CSRF after server-confirmed logout", async () => {
    request
      .mockResolvedValueOnce(reply({ account, csrfToken: "a" }))
      .mockResolvedValueOnce(reply({ ok: true }))
    const client = createAccountClient("/account", request)
    await client.session()
    await client.logout()
    await expect(client.updateName("Levi")).rejects.toThrow("会话尚未就绪")
    expect(request).toHaveBeenCalledTimes(2)
  })
})
