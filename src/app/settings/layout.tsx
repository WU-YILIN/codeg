import { Suspense } from "react"
import { SettingsShell } from "@/components/settings/settings-shell"
import { RemoteConnectionGate } from "@/contexts/remote-connection-context"
import { UpdateProvider } from "@/components/providers/update-provider"
import { MantapalAccountGate } from "@/features/mantapal/account-provider"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense>
      <MantapalAccountGate>
        <RemoteConnectionGate>
          <UpdateProvider>
            <SettingsShell>{children}</SettingsShell>
          </UpdateProvider>
        </RemoteConnectionGate>
      </MantapalAccountGate>
    </Suspense>
  )
}
