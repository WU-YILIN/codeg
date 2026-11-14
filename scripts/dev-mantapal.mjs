import { spawn } from "node:child_process"
import { createRequire } from "node:module"

// Explicitly local, cross-platform review mode; production builds never import
// the demo account adapter. The actual Codeg backend is still required for work.
const require = createRequire(import.meta.url)
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--turbopack",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_PUBLIC_MANTAPAL_DEMO: "1",
    },
  }
)
child.on("error", (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on("exit", (code) => {
  process.exitCode = code ?? 1
})
