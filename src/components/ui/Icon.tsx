import type { ReactElement, ReactNode } from 'react'

/**
 * The whole icon set, inline. No runtime dependency, no sprite fetch, no
 * flash of missing glyphs on first paint.
 *
 * House rules for every glyph:
 *  · 24×24 grid, ~2px optical margin, geometry snapped to .25 units
 *  · stroke-only on `currentColor` — the <svg> supplies stroke/caps/joins
 *  · solid dots are the one exception (a 1.75px round cap reads as lint)
 */
const PATHS = {
  // ── Ledger / category ────────────────────────────────────────────────────
  wallet: (
    <>
      <path d="M19.5 9.25V7.5A1.5 1.5 0 0 0 18 6H5.5A2.5 2.5 0 0 0 3 8.5v8A2.5 2.5 0 0 0 5.5 19H18a1.5 1.5 0 0 0 1.5-1.5v-1.75" />
      <path d="M20.25 9.25h-3.5a2.75 2.75 0 0 0 0 5.5h3.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 0-.75-.75Z" />
    </>
  ),
  sparkle: (
    <>
      <path d="M10.5 2.75c.66 3.63 1.87 4.84 5.5 5.5-3.63.66-4.84 1.87-5.5 5.5-.66-3.63-1.87-4.84-5.5-5.5 3.63-.66 4.84-1.87 5.5-5.5Z" />
      <path d="M17.5 13.75c.33 1.82.94 2.42 2.75 2.75-1.81.33-2.42.93-2.75 2.75-.33-1.82-.94-2.42-2.75-2.75 1.81-.33 2.42-.93 2.75-2.75Z" />
    </>
  ),
  briefcase: (
    <>
      <path d="M3.5 9.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
      <path d="M9 7.5V6.25A1.75 1.75 0 0 1 10.75 4.5h2.5A1.75 1.75 0 0 1 15 6.25V7.5" />
      <path d="M3.5 12.75h6.25M14.25 12.75h6.25" />
      <path d="M10.5 11.5h3v2.5h-3Z" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14.5 4 9.5l5-5" />
      <path d="M4 9.5h10a5.5 5.5 0 0 1 0 11h-3" />
    </>
  ),
  'trend-up': (
    <>
      <path d="M3.5 16.75 9.5 10.75l3.5 3.5L20.5 6.75" />
      <path d="M15 6.75h5.5v5.5" />
    </>
  ),
  gift: (
    <>
      <rect x="3.25" y="8.5" width="17.5" height="4" rx="1.25" />
      <path d="M4.75 12.5v6.25a1.75 1.75 0 0 0 1.75 1.75h11a1.75 1.75 0 0 0 1.75-1.75V12.5" />
      <path d="M12 8.5v12" />
      <path d="M12 8.5S10.9 3.75 8.6 3.75a2.375 2.375 0 0 0 0 4.75Z" />
      <path d="M12 8.5s1.1-4.75 3.4-4.75a2.375 2.375 0 0 1 0 4.75Z" />
    </>
  ),
  'plus-circle': (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 10.6 12 4l8.5 6.6" />
      <path d="M5.5 9.15V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.15" />
      <path d="M9.75 20.5v-5.25a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1v5.25" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="16" r="4" />
      <path d="M10.85 13.15 20.5 3.5" />
      <path d="m15.75 8.25 2.5 2.5" />
      <path d="m18 6 2.5 2.5" />
    </>
  ),
  bolt: (
    <path d="M13.75 2.25 4.5 13.75h6.25l-.5 8L19.5 10.25h-6.25l.5-8Z" />
  ),
  wifi: (
    <>
      <path d="M2.75 9.25a14 14 0 0 1 18.5 0" />
      <path d="M6 12.75a9.25 9.25 0 0 1 12 0" />
      <path d="M9.25 16.25a4.5 4.5 0 0 1 5.5 0" />
      <circle cx="12" cy="19.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  phone: (
    <>
      <rect x="6.25" y="2.5" width="11.5" height="19" rx="2.75" />
      <path d="M10.5 5.5h3" />
      <path d="M10.25 18.5h3.5" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.75" />
      <path d="M2.5 9.75h19" />
      <path d="M6.25 14.75h3.5" />
    </>
  ),
  bank: (
    <>
      <path d="M3.25 9.5 12 4.25l8.75 5.25" />
      <path d="M4 9.5h16" />
      <path d="M5.5 11v7M9.75 11v7M14.25 11v7M18.5 11v7" />
      <path d="M2.75 20.5h18.5" />
    </>
  ),
  car: (
    <>
      <path d="m4.75 11.75 1.85-4.4A2.25 2.25 0 0 1 8.68 6h6.64a2.25 2.25 0 0 1 2.08 1.35l1.85 4.4" />
      <path d="M3.5 11.75h17A1.25 1.25 0 0 1 21.75 13v3.25a1.25 1.25 0 0 1-1.25 1.25h-17a1.25 1.25 0 0 1-1.25-1.25V13a1.25 1.25 0 0 1 1.25-1.25Z" />
      <circle cx="7" cy="17.75" r="1.75" />
      <circle cx="17" cy="17.75" r="1.75" />
    </>
  ),
  cart: (
    <>
      <path d="M2.5 3.75h2.05a1.1 1.1 0 0 1 1.08.88l.32 1.62" />
      <path d="M5.95 6.25h14.3a.9.9 0 0 1 .88 1.1l-1.35 6a1.9 1.9 0 0 1-1.85 1.48H9.2a1.9 1.9 0 0 1-1.86-1.52Z" />
      <circle cx="9.75" cy="19" r="1.55" />
      <circle cx="17.25" cy="19" r="1.55" />
    </>
  ),
  utensils: (
    <>
      <path d="M4.5 3v5.25a2.5 2.5 0 0 0 5 0V3" />
      <path d="M7 3v4.5" />
      <path d="M7 10.75V21" />
      <path d="M19.25 12.75V3c-2.4.85-3.9 3.05-3.9 5.55v2.45c0 .97.78 1.75 1.75 1.75Z" />
      <path d="M17.5 12.75V21" />
    </>
  ),
  bus: (
    <>
      <rect x="4" y="3.5" width="16" height="14" rx="2.5" />
      <path d="M4 10h16" />
      <path d="M12 3.5v6.5" />
      <path d="M6.75 14.25h1.5M15.75 14.25h1.5" />
      <circle cx="8" cy="19" r="1.6" />
      <circle cx="16" cy="19" r="1.6" />
    </>
  ),
  shield: (
    <path d="M12 3.25 4.75 6.1v5.55c0 4.5 3 7.9 7.25 9.1 4.25-1.2 7.25-4.6 7.25-9.1V6.1Z" />
  ),
  heart: (
    <path d="M12 20.25S3.75 15.5 3.75 9.6A4.6 4.6 0 0 1 8.35 5a4.35 4.35 0 0 1 3.65 2.05A4.35 4.35 0 0 1 15.65 5a4.6 4.6 0 0 1 4.6 4.6c0 5.9-8.25 10.65-8.25 10.65Z" />
  ),
  child: (
    <>
      <circle cx="12" cy="6" r="2.75" />
      <path d="M12 8.75v6.5" />
      <path d="M7.75 11.5h8.5" />
      <path d="m9.5 21 2.5-5.75L14.5 21" />
    </>
  ),
  book: (
    <>
      <path d="M4.5 5A2.5 2.5 0 0 1 7 2.5h12.5v16.75H7a2.5 2.5 0 0 0-2.5 2.5Z" />
      <path d="M8.5 7h6.5" />
    </>
  ),
  repeat: (
    <>
      <path d="m17.5 2.5 3.5 3.5-3.5 3.5" />
      <path d="M21 6H7.5A4.5 4.5 0 0 0 3 10.5v1" />
      <path d="M6.5 21.5 3 18l3.5-3.5" />
      <path d="M3 18h13.5a4.5 4.5 0 0 0 4.5-4.5v-1" />
    </>
  ),
  bag: (
    <>
      <path d="M5.25 7.5h13.5l1 11.9a1.5 1.5 0 0 1-1.5 1.6H5.75a1.5 1.5 0 0 1-1.5-1.6Z" />
      <path d="M8.75 10.25V6.75a3.25 3.25 0 0 1 6.5 0v3.5" />
    </>
  ),
  plane: (
    <path d="M12 2.5c1.12 0 2.03 1.6 2.03 3.58v3.05l7.22 4.3v2.32l-7.22-2.3v3.9l2.5 1.87v1.73L12 19.7l-4.53 1.25v-1.73l2.5-1.87v-3.9l-7.22 2.3v-2.32l7.22-4.3V6.08c0-1.98.91-3.58 2.03-3.58Z" />
  ),
  piggy: (
    <>
      <path d="M12.25 6.75c4.28 0 7.75 2.8 7.75 6.25 0 1.98-1.14 3.75-2.92 4.9v1.6a1.25 1.25 0 0 1-1.25 1.25h-.75a1.25 1.25 0 0 1-1.25-1.25v-.6a11.4 11.4 0 0 1-3.16 0v.6a1.25 1.25 0 0 1-1.25 1.25h-.75a1.25 1.25 0 0 1-1.25-1.25v-1.6a7.3 7.3 0 0 1-2.6-3.4H3.5A1.5 1.5 0 0 1 2 12.5V12a1.5 1.5 0 0 1 1.5-1.5h1.3a7 7 0 0 1 2.68-3.1L6.6 5.25l3.35 1.85a10.3 10.3 0 0 1 2.3-.35Z" />
      <path d="M13 10h4" />
      <circle cx="8.25" cy="12.25" r=".95" fill="currentColor" stroke="none" />
    </>
  ),
  'minus-circle': (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M8.5 12h7" />
    </>
  ),

  // ── Interface ────────────────────────────────────────────────────────────
  'chevron-left': <path d="M15 5.5 8.5 12l6.5 6.5" />,
  'chevron-right': <path d="M9 5.5 15.5 12 9 18.5" />,
  'chevron-down': <path d="M5.5 9 12 15.5 18.5 9" />,
  'chevron-up': <path d="M5.5 15 12 8.5l6.5 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m4.75 12.5 4.75 4.75L19.25 6.75" />,
  trash: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V5A1.5 1.5 0 0 1 11 3.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
      <path d="m6.5 6.5.83 12.15a2 2 0 0 0 2 1.85h5.34a2 2 0 0 0 2-1.85L17.5 6.5" />
      <path d="M10.25 10.5v6M13.75 10.5v6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.25" y="5" width="17.5" height="16" rx="2.75" />
      <path d="M3.25 10h17.5" />
      <path d="M8 3v4M16 3v4" />
      <circle cx="8" cy="14.25" r=".95" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.25" r=".95" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14.25" r=".95" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.15" />
      <path d="M19.35 14.5a1.5 1.5 0 0 0 .3 1.65l.05.05a1.8 1.8 0 1 1-2.55 2.55l-.05-.05a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.15a1.8 1.8 0 0 1-3.6 0v-.08a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.05.05a1.8 1.8 0 1 1-2.55-2.55l.05-.05a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9h-.15a1.8 1.8 0 0 1 0-3.6h.08a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.05-.05a1.8 1.8 0 1 1 2.55-2.55l.05.05a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37v-.15a1.8 1.8 0 0 1 3.6 0v.08a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.05-.05a1.8 1.8 0 1 1 2.55 2.55l-.05.05a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.15a1.8 1.8 0 0 1 0 3.6h-.08a1.5 1.5 0 0 0-1.37.9Z" />
    </>
  ),
  'arrow-up': (
    <>
      <path d="M12 19.5v-15" />
      <path d="m5.75 10.75 6.25-6.25 6.25 6.25" />
    </>
  ),
  'arrow-down': (
    <>
      <path d="M12 4.5v15" />
      <path d="m18.25 13.25-6.25 6.25-6.25-6.25" />
    </>
  ),
  dots: (
    <>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  pencil: (
    <>
      {/* Body + graphite tip, both edges converging on a single point. */}
      <path d="M3.6 20.4 7.2 19.75 18.5 8.45a2.1 2.1 0 0 0-2.95-2.95L4.25 16.8Z" />
      <path d="m4.25 16.8 2.95 2.95" />
      <path d="m12.7 8.3 2.95 2.95" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.75c.6 0 1.16.32 1.45.83l7.4 12.92c.62 1.08-.16 2.42-1.45 2.42H4.6c-1.29 0-2.07-1.34-1.45-2.42l7.4-12.92c.29-.51.85-.83 1.45-.83Z" />
      <path d="M12 9.5v4.25" />
      <circle cx="12" cy="16.75" r="1" fill="currentColor" stroke="none" />
    </>
  ),
} satisfies Record<string, ReactNode>

/** Every glyph the app can render. Derived, so it can never drift from PATHS. */
export type IconName = keyof typeof PATHS

export interface IconProps {
  name: IconName
  /** Rendered box in px. Defaults to 24. */
  size?: number
  className?: string
  /** Defaults to 1.75 — thin enough to look drawn, thick enough to read at 16px. */
  strokeWidth?: number
}

export function Icon({ name, size = 24, className, strokeWidth = 1.75 }: IconProps): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

/** Runtime guard for icon keys that arrive as plain strings (e.g. from data). */
export function isIconName(value: string): value is IconName {
  return Object.prototype.hasOwnProperty.call(PATHS, value)
}
