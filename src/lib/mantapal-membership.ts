// Software-membership contract. Distinct from Sub2API gateway-credit subscriptions.
// Only Free is issued today; Pro is reserved for future server-issued entitlements.
export type MantapalTier = "free" | "pro"

export interface MantapalMembership {
  schema_version: 1
  tier: MantapalTier
  status: "active" | "inactive" | "expired"
  entitlements: Record<string, boolean>
  subscription: unknown | null
  upgrade_available: boolean
  managed_agents?: string[]
}

export function parseMantapalMembership(
  raw: unknown
): MantapalMembership | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (value.schema_version !== 1) return null
  if (value.tier !== "free" && value.tier !== "pro") return null
  if (!["active", "inactive", "expired"].includes(String(value.status))) return null
  if (typeof value.upgrade_available !== "boolean") return null
  if (value.managed_agents !== undefined &&
    (!Array.isArray(value.managed_agents) ||
      !value.managed_agents.every((v: unknown) => typeof v === "string"))) return null
  const entitlements = value.entitlements
  if (!entitlements || typeof entitlements !== "object" || Array.isArray(entitlements)) return null
  if (!Object.values(entitlements).every((entry) => typeof entry === "boolean")) return null
  return raw as MantapalMembership
}

// Keep the authorization decision server-side. UI helpers only display claims;
// they must never grant access to a future paid server feature.
export function hasMembershipEntitlement(
  membership: MantapalMembership | null,
  feature: string
): boolean {
  return membership?.status === "active" && membership.entitlements[feature] === true
}
