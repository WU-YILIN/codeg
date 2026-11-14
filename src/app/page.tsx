"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useMantapalAccount } from "@/features/mantapal/account-provider"
import { BrandSplash } from "@/features/mantapal/brand"
import { isDesktop } from "@/lib/platform"
import {
  codegAuthHeaders,
  probeProxyAuthentication,
  unauthorizedSource,
} from "@/lib/transport/web-auth"

export default function Page() {
  const router = useRouter()
  const { account, loading } = useMantapalAccount()
  useEffect(() => {
    if (loading) return
    if (!account || account.firstUse) {
      router.replace("/login")
      return
    }
    if (isDesktop()) {
      router.replace("/workspace")
      return
    }
    // Web mode: validate token before entering app
    const token = localStorage.getItem("codeg_token")
    if (!token) {
      // A proxy in front of Codeg may have signed the user in already
      // (CODEG_AUTH=proxy-jwt); an unreachable server leaves that to the
      // in-app connection dialog, as with a token.
      void probeProxyAuthentication().then((result) => {
        router.replace(
          result === "unauthorized" ? "/server-login" : "/workspace"
        )
      })
      return
    }
    // Verify token is still valid
    fetch("/api/health", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...codegAuthHeaders(token),
      },
      body: "{}",
    })
      .then((res) => {
        if (res.ok) {
          router.replace("/workspace")
          return
        }
        if (
          res.status === 401 &&
          unauthorizedSource(res.headers.get("www-authenticate")) === "codeg"
        ) {
          // Token genuinely rejected → clear it and re-authenticate.
          localStorage.removeItem("codeg_token")
          router.replace("/server-login")
          return
        }
        // Server reachable but unhealthy (5xx / proxy error), or a proxy in
        // front of Codeg refused (its own session expired). Keep the token
        // and enter the app; the in-app connection dialog handles recovery
        // instead of bouncing a valid session to /login.
        router.replace("/workspace")
      })
      .catch(() => {
        // Server unreachable (restart, network blip, sleep/wake). The token is
        // almost certainly still valid — don't discard it. Enter the workspace
        // and let WebConnectionGuard surface the offline state and recover.
        router.replace("/workspace")
      })
  }, [router, account, loading])
  return <BrandSplash />
}
