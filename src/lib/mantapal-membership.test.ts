import { describe, expect, it } from "vitest"
import {
  hasMembershipEntitlement,
  parseMantapalMembership,
} from "./mantapal-membership"

describe("Mantapal software membership contract", () => {
  const free = {
    schema_version: 1,
    tier: "free",
    status: "active",
    entitlements: { byok: true, local_agents: true, local_workspaces: true },
    subscription: null,
    upgrade_available: false,
  }

  it("accepts the default Free member without any payment state", () => {
    const value = parseMantapalMembership(free)
    expect(value?.tier).toBe("free")
    expect(value?.subscription).toBeNull()
    expect(hasMembershipEntitlement(value, "byok")).toBe(true)
  })

  it("fails closed on malformed and unknown contracts", () => {
    expect(parseMantapalMembership({ ...free, tier: "enterprise" })).toBeNull()
    expect(parseMantapalMembership({ ...free, schema_version: 2 })).toBeNull()
    expect(parseMantapalMembership({ ...free, entitlements: { byok: "true" } })).toBeNull()
    expect(hasMembershipEntitlement(null, "byok")).toBe(false)
  })

  it("does not authorize an inactive member for a future paid feature", () => {
    const value = parseMantapalMembership({
      ...free,
      status: "inactive",
      entitlements: { cloud_sync: true },
    })
    expect(hasMembershipEntitlement(value, "cloud_sync")).toBe(false)
  })
})
