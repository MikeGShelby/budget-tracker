/**
 * Civil-date utilities.
 *
 * The whole app reasons about *local calendar days*, never instants. Parsing
 * `"2026-01-01"` with `new Date(...)` yields UTC midnight, which is the previous
 * day for anyone west of Greenwich — that class of bug shifts a paycheck onto
 * the wrong day, so every conversion goes through here instead.
 */
import type { IsoDate } from './types'

/** Local `Date` at midnight for an ISO day. */
export function parseIso(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** Local `Date` -> ISO `yyyy-MM-dd`, using local field values. */
export function toIso(date: Date): IsoDate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayIso(): IsoDate {
  return toIso(new Date())
}

export function isValidIso(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = parseIso(value)
  return !Number.isNaN(parsed.getTime()) && toIso(parsed) === value
}

/** Build an ISO date from calendar parts, clamping the day into the month. */
export function isoFromParts(year: number, monthIndex: number, day: number): IsoDate {
  const maxDay = daysInMonth(year, monthIndex)
  return toIso(new Date(year, monthIndex, Math.min(day, maxDay)))
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIso(date)
  d.setDate(d.getDate() + days)
  return toIso(d)
}

/**
 * Add months while preserving the *intended* day of month.
 *
 * `anchorDay` is the day the series really wants (e.g. the 31st). Naive
 * `setMonth` overflows Jan 31 + 1 month into Mar 3; this clamps to Feb 28/29 and
 * then recovers the 31st in months that have one.
 */
export function addMonthsClamped(date: IsoDate, months: number, anchorDay?: number): IsoDate {
  const d = parseIso(date)
  const day = anchorDay ?? d.getDate()
  const targetMonth = d.getMonth() + months
  const year = d.getFullYear() + Math.floor(targetMonth / 12)
  const monthIndex = ((targetMonth % 12) + 12) % 12
  return isoFromParts(year, monthIndex, day)
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function diffDays(a: IsoDate, b: IsoDate): number {
  const ms = parseIso(b).getTime() - parseIso(a).getTime()
  // Divide on the millisecond total then round, so DST transitions (23h/25h
  // days) still yield whole-day counts.
  return Math.round(ms / 86_400_000)
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function minIso(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b
}

export function maxIso(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return a < b
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return a > b
}

export function isSameMonth(a: IsoDate, b: IsoDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`
}

export function endOfMonth(date: IsoDate): IsoDate {
  const d = parseIso(date)
  return isoFromParts(d.getFullYear(), d.getMonth(), daysInMonth(d.getFullYear(), d.getMonth()))
}

export function dayOfWeek(date: IsoDate): number {
  return parseIso(date).getDay()
}

/**
 * The 6×7 grid a month calendar renders, including the leading/trailing days
 * from adjacent months. Always 42 cells so the grid height never jumps between
 * months — a detail that reads as "cheap" the moment it's missing.
 */
export function monthGridDates(monthAnchor: IsoDate, weekStartsOn: 0 | 1): IsoDate[] {
  const first = startOfMonth(monthAnchor)
  const leading = (dayOfWeek(first) - weekStartsOn + 7) % 7
  const gridStart = addDays(first, -leading)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

/** Inclusive list of every ISO date in `[from, to]`. */
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  if (from > to) return []
  const out: IsoDate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function weekdayLabels(weekStartsOn: 0 | 1, locale = 'en-US'): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
  // 2024-01-07 is a Sunday, giving a stable reference week.
  return Array.from({ length: 7 }, (_, i) =>
    formatter.format(new Date(2024, 0, 7 + ((i + weekStartsOn) % 7))),
  )
}

export function formatMonthTitle(date: IsoDate, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(parseIso(date))
}

export function formatDayTitle(date: IsoDate, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parseIso(date))
}

export function formatShortDate(date: IsoDate, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(parseIso(date))
}
