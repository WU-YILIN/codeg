"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { AccountServiceError, createAccountClient } from "./account-client"
import type { AccountService, MantapalAccount } from "./contract"
import { BrandSplash } from "./brand"
import { accountLoginPath } from "./login-return"

type AccountContextValue = {
  service: AccountService | null
  account: MantapalAccount | null
  loading: boolean
  error: string
  demo: boolean
  refresh: () => Promise<void>
  signedIn: (account: MantapalAccount) => void
  logout: () => Promise<void>
}
const Context = createContext<AccountContextValue | null>(null)
const SESSION_EVENT_KEY = "mantapal:account-session:v1"

// Only an invalidation notice crosses windows. Identity and credentials always
// come from the account service, never from browser storage.
function notifySessionChange(action: "refresh" | "logout") {
  try {
    localStorage.setItem(
      SESSION_EVENT_KEY,
      JSON.stringify({ action, nonce: crypto.randomUUID() })
    )
  } catch {
    // Windows also recheck on focus when storage is unavailable.
  }
}

export function MantapalAccountProvider({ children }: { children: ReactNode }) {
  const [startupReady, setStartupReady] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setStartupReady(true), 900)
    return () => clearTimeout(timer)
  }, [])
  const [service, setService] = useState<AccountService | null>(null)
  const [account, setAccount] = useState<MantapalAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const sessionRequest = useRef<AbortController | null>(null)
  const demo =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_MANTAPAL_DEMO === "1"
  useEffect(() => {
    let live = true
    if (demo) {
      void import("./demo-account").then(({ createDemoAccountService }) => {
        if (live) setService(createDemoAccountService())
      })
    } else setService(createAccountClient())
    return () => {
      live = false
    }
  }, [demo])
  const readSession = useCallback(
    async (foreground: boolean) => {
      if (!service) return
      sessionRequest.current?.abort()
      const abort = new AbortController()
      sessionRequest.current = abort
      if (foreground) setLoading(true)
      try {
        const value = await service.session(abort.signal)
        if (!abort.signal.aborted) {
          setAccount(value.account)
          setError("")
        }
      } catch (cause) {
        if (!abort.signal.aborted) {
          if (
            foreground ||
            (cause instanceof AccountServiceError &&
              (cause.status === 401 || cause.status === 403))
          )
            setAccount(null)
          setError(
            cause instanceof Error ? cause.message : "账户服务暂时不可用。"
          )
        }
      } finally {
        if (!abort.signal.aborted) setLoading(false)
      }
    },
    [service]
  )
  const refresh = useCallback(() => readSession(true), [readSession])
  useEffect(() => {
    void refresh()
    return () => sessionRequest.current?.abort()
  }, [refresh])
  useEffect(() => {
    const recheck = () => {
      if (account && document.visibilityState === "visible")
        void readSession(false)
    }
    const changed = (event: StorageEvent) => {
      if (demo || event.key !== SESSION_EVENT_KEY || !event.newValue) return
      try {
        const { action } = JSON.parse(event.newValue)
        if (action !== "refresh" && action !== "logout") return
        if (action === "logout") {
          sessionRequest.current?.abort()
          setAccount(null)
        }
        void readSession(false)
      } catch {
        // Ignore unrelated or malformed browser state.
      }
    }
    window.addEventListener("focus", recheck)
    document.addEventListener("visibilitychange", recheck)
    window.addEventListener("storage", changed)
    return () => {
      window.removeEventListener("focus", recheck)
      document.removeEventListener("visibilitychange", recheck)
      window.removeEventListener("storage", changed)
    }
  }, [account, demo, readSession])
  const signedIn = useCallback(
    (value: MantapalAccount) => {
      sessionRequest.current?.abort()
      setAccount(value)
      setLoading(false)
      setError("")
      if (!demo) notifySessionChange("refresh")
    },
    [demo]
  )
  const logout = useCallback(async () => {
    if (!service) return
    await service.logout()
    sessionRequest.current?.abort()
    setAccount(null)
    setError("")
    setLoading(false)
    if (!demo) notifySessionChange("logout")
    await readSession(false)
  }, [service, demo, readSession])
  return (
    <Context.Provider
      value={{
        service,
        account,
        loading: loading || !startupReady,
        error,
        demo,
        refresh,
        signedIn,
        logout,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useOptionalMantapalAccount() {
  return useContext(Context)
}
export function useMantapalAccount() {
  const value = useContext(Context)
  if (!value) throw new Error("MantapalAccountProvider is required")
  return value
}
export function MantapalAccountGate({ children }: { children: ReactNode }) {
  const { account, loading } = useMantapalAccount()
  const router = useRouter()
  useEffect(() => {
    if (!loading && (!account || account.firstUse))
      router.replace(
        accountLoginPath(window.location.pathname, window.location.search)
      )
  }, [account, loading, router])
  if (loading || !account || account.firstUse) return <BrandSplash />
  return children
}

/** Server connection notices are irrelevant on a signed-out account screen. */
export function MantapalConnectionChrome({
  children,
}: {
  children: ReactNode
}) {
  const { account, loading } = useMantapalAccount()
  return !loading && account && !account.firstUse ? children : null
}
