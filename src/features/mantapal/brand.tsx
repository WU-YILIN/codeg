import Image from "next/image"
import { cn } from "@/lib/utils"

export function MantapalLogo({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <Image
      src={compact ? "/mantapal/symbol.png" : "/mantapal/logo.png"}
      alt="Mantapal"
      width={compact ? 40 : 240}
      height={compact ? 40 : 80}
      priority
      className={cn("mp-brand", className)}
    />
  )
}
export function BrandSplash() {
  return (
    <div className="mp-splash" role="status" aria-label="Mantapal 正在启动">
      <MantapalLogo />
      <span className="mp-splash-progress" />
      <span>MANTAPAL</span>
    </div>
  )
}
