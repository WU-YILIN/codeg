"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useMantapalAccount } from "@/features/mantapal/account-provider"
import { MantapalLogo } from "@/features/mantapal/brand"
import type { Policy } from "@/features/mantapal/contract"
export default function PolicyPage() {
  const { service, account } = useMantapalAccount()
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!service) return
    const abort = new AbortController()
    void service
      .policy(abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setPolicy(value)
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(cause.message)
      })
    return () => abort.abort()
  }, [service, retry])
  return (
    <main className="mp-policy">
      <MantapalLogo />
      <Link href={account ? "/workspace" : "/login"}>
        ← {account ? "返回工作台" : "返回登录"}
      </Link>
      <h1>隐私政策与权益声明</h1>
      {error ? (
        <p role="alert">
          {error}
          <button
            className="mp-link"
            onClick={() => {
              setError("")
              setRetry((v) => v + 1)
            }}
          >
            重试
          </button>
        </p>
      ) : policy ? (
        <>
          <small>版本 {policy.version}</small>
          <h2>隐私政策</h2>
          <p>{policy.privacy}</p>
          <h2>权益声明</h2>
          <p>{policy.rights}</p>
        </>
      ) : (
        <p role="status">正在加载…</p>
      )}
    </main>
  )
}
