import type { SVGProps } from "react"

const shapes = {
  chat: (
    <>
      <path d="M6 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3V6a2 2 0 0 1 2-2Z" />
      <path d="M8 8h8M8 12c1.4-1.2 2.6-1.2 4 0s2.6 1.2 4 0" />
    </>
  ),
  workflow: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M7 6h7a4 4 0 0 1 0 8h-4a2 2 0 0 0 0 4h7" />
    </>
  ),
  history: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m7 8 1.4 1.4L11 6.8M13 8h4M7 14h10M7 17h6" />
    </>
  ),
  projects: (
    <>
      <path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4H9l2 3h8.5A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V7Z" />
      <path d="M3 9h18" />
    </>
  ),
  canvas: (
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
      <rect x="7.5" y="7.5" width="9" height="9" rx="1" />
    </>
  ),
  workspace: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 9v11" />
    </>
  ),
  knowledge: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  agents: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 17h6M17 14v6" />
    </>
  ),
  support: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="m5.6 5.6 3.6 3.6m5.6 5.6 3.6 3.6M18.4 5.6l-3.6 3.6m-5.6 5.6-3.6 3.6" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 4v16h17M8 15v-4M13 15V7M18 15V3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m16 16 5 5" />
    </>
  ),
  team: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h4m4 0h8M4 17h8m4 0h4" />
      <circle cx="10" cy="7" r="2" />
      <circle cx="14" cy="17" r="2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v6c0 4.2 3.5 7.2 8 9 4.5-1.8 8-4.8 8-9V6l-8-3Z" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  billing: (
    <>
      <path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" />
      <path d="M8 7h8M8 11h8M8 15h4" />
    </>
  ),
  upload: (
    <>
      <path d="M4 16v4h16v-4M12 16V3m-5 5 5-5 5 5" />
    </>
  ),
  download: (
    <>
      <path d="M4 16v4h16v-4M12 3v13m-5-5 5 5 5-5" />
    </>
  ),
  models: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3M18 9h3m-3 6h3" />
    </>
  ),
  integrations: (
    <>
      <path
        d="m9 15 6-6M8 17l-1 1a4.2 4.2 0 0 1-6-6l4-4a4.2 4.2 0 0 1 6 0M16 7l1-1a4.2 4.2 0 0 1 6 6l-4 4a4.2 4.2 0 0 1-6 0"
        transform="translate(1 -1) scale(.92)"
      />
    </>
  ),
  notifications: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0v5l-2 4h16l-2-4V8ZM10 21h4" />
    </>
  ),
  "api-key": (
    <>
      <circle cx="8" cy="9" r="5" />
      <path d="m12 13 8 8m-4-4 3-3m-6 0 3-3" />
    </>
  ),
  quick: (
    <>
      <path d="m14 3-9 11h7l-2 7 9-11h-7l2-7Z" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
    </>
  ),
  collapse: (
    <>
      <path d="m7 3 5 5 5-5M4 12h16m-13 9 5-5 5 5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3m6 0h4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  "arrow-up": (
    <>
      <path d="M12 20V4m-6 6 6-6 6 6" />
    </>
  ),
  playground: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 9v11" />
    </>
  ),
} as const
export type MantapalIconName = keyof typeof shapes
export function MantapalIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: MantapalIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {shapes[name]}
    </svg>
  )
}
export function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return <MantapalIcon {...props} name="chat" />
}
export function WorkflowIcon(props: SVGProps<SVGSVGElement>) {
  return <MantapalIcon {...props} name="workflow" />
}
export function HistoryIcon(props: SVGProps<SVGSVGElement>) {
  return <MantapalIcon {...props} name="history" />
}
export function ProjectsIcon(props: SVGProps<SVGSVGElement>) {
  return <MantapalIcon {...props} name="projects" />
}
export function CanvasIcon(props: SVGProps<SVGSVGElement>) {
  return <MantapalIcon {...props} name="canvas" />
}
