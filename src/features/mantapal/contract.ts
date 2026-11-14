import { z } from "zod"

export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phoneMasked: z.string(),
  tier: z.enum(["free", "pro"]),
  firstUse: z.boolean(),
  wechatBound: z.boolean(),
})
export type MantapalAccount = z.infer<typeof accountSchema>
export const sessionSchema = z.object({
  account: accountSchema.nullable(),
  csrfToken: z.string().min(1),
})
export const usageSchema = z.object({
  used: z.number().nonnegative(),
  limit: z.number().positive().nullable(),
  unit: z.string().min(1),
  periodLabel: z.string(),
  updatedAt: z.string().datetime(),
})
export type MantapalUsage = z.infer<typeof usageSchema>
export const policySchema = z.object({
  version: z.string().min(1),
  privacy: z.string().min(1),
  rights: z.string().min(1),
})
export type Policy = z.infer<typeof policySchema>
export const challengeSchema = z.object({
  id: z.string().min(1),
  qrContent: z.string().min(1),
  expiresAt: z.string().datetime(),
})
export type WechatChallenge = z.infer<typeof challengeSchema>
export const wechatStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("waiting") }),
  z.object({ status: z.literal("expired") }),
  z.object({ status: z.literal("phone_required"), ticket: z.string().min(1) }),
  z.object({ status: z.literal("authenticated"), account: accountSchema }),
])
export type WechatStatus = z.infer<typeof wechatStatusSchema>
export type OtpPurpose = "login" | "register" | "reset" | "bind"
export interface AccountService {
  session(signal?: AbortSignal): Promise<z.infer<typeof sessionSchema>>
  policy(signal?: AbortSignal): Promise<Policy>
  password(account: string, password: string): Promise<MantapalAccount>
  sendCode(phone: string, purpose: OtpPurpose): Promise<{ retryAfter: number }>
  phone(phone: string, code: string): Promise<MantapalAccount>
  register(input: {
    phone: string
    code: string
    password: string
    policyVersion: string
    accepted: true
  }): Promise<MantapalAccount>
  wechat(signal?: AbortSignal): Promise<WechatChallenge>
  wechatStatus(id: string, signal?: AbortSignal): Promise<WechatStatus>
  bindPhone(input: {
    ticket: string
    phone: string
    code: string
    policyVersion: string
    accepted: true
  }): Promise<MantapalAccount>
  verifyReset(phone: string, code: string): Promise<{ ticket: string }>
  resetPassword(ticket: string, password: string): Promise<void>
  updateName(name: string): Promise<MantapalAccount>
  usage(signal?: AbortSignal): Promise<MantapalUsage>
  logout(): Promise<void>
}
export const phoneIsValid = (value: string) => /^1[3-9]\d{9}$/.test(value)
export const passwordIsValid = (value: string) =>
  value.length >= 8 &&
  value.length <= 32 &&
  /[a-z]/i.test(value) &&
  /\d/.test(value) &&
  !/\s/.test(value)
