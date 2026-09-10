/**
 * Recurrence expansion.
 *
 * Turns a `BudgetEvent`'s rule into the concrete civil dates it fires on inside
 * a window. Two properties matter more than anything else here:
 *
 *  1. **Correctness at month edges.** A rule anchored on the 31st must fire on
 *     Feb 28/29 and then *recover* to the 31st in March — it must not drift down
 *     to the 28th for the rest of time. Every monthly/yearly step is therefore
 *     computed as `startDate + N months` against the original anchor day rather
 *     than by stepping off the previous occurrence.
 *
 *  2. **No day-by-day scanning.** A weekly event created in 2015 and viewed in
 *     2050 must not walk 18,000 days to find the first hit. We jump straight to
 *     the first occurrence on or after the window with arithmetic, then step.
 */
import type { BudgetEvent, IsoDate } from './types'
import {
  addDays,
  addMonthsClamped,
  diffDays,
  formatShortDate,
  isoFromParts,
  maxIso,
  minIso,
  parseIso,
} from './dates'

/**
 * Safety valve. Every generator advances by a strictly positive interval, so
 * this should be unreachable — it exists so a corrupt stored rule degrades into
 * a truncated list rather than hanging the UI thread.
 */
const MAX_OCCURRENCES = 10_000

/** Highest legal day-of-month for a semimonthly rule. */
const MAX_DAY_OF_MONTH = 31

/**
 * Every date `event` fires on within `[from, to]`, ascending and de-duplicated.
 *
 * Honours `recurrence.until` (inclusive), `skippedDates`, and never emits a date
 * before `event.startDate` even when `from` reaches further back.
 */
export function occurrencesInRange(event: BudgetEvent, from: IsoDate, to: IsoDate): IsoDate[] {
  if (!event || !event.startDate || !from || !to) return []
  if (from > to) return []

  const until = event.recurrence?.until ?? null
  // Clip the window to the series: `lo` never precedes the first occurrence and
  // `hi` never outlives `until`.
  const lo = maxIso(from, event.startDate)
  const hi = until ? minIso(to, until) : to
  if (lo > hi) return []

  const dates = generate(event, lo, hi)

  const skipped = event.skippedDates
  if (!skipped || skipped.length === 0) return dates
  const skippedSet = new Set(skipped)
  return dates.filter((date) => !skippedSet.has(date))
}

/**
 * Expand the rule across `[lo, hi]`, where `lo >= event.startDate` and `hi` has
 * already been capped by `until`.
 */
function generate(event: BudgetEvent, lo: IsoDate, hi: IsoDate): IsoDate[] {
  const { startDate } = event
  const frequency = event.recurrence?.frequency ?? 'once'

  switch (frequency) {
    case 'once':
      return startDate >= lo && startDate <= hi ? [startDate] : []
    case 'weekly':
      return byDayInterval(startDate, lo, hi, 7)
    case 'biweekly':
      return byDayInterval(startDate, lo, hi, 14)
    case 'semimonthly':
      return bySemimonthly(event, lo, hi)
    case 'monthly':
      return byMonthInterval(startDate, lo, hi, 1)
    case 'yearly':
      return byMonthInterval(startDate, lo, hi, 12)
    default:
      // Unknown frequency in stored data: behave like a one-off rather than
      // silently dropping the event off the calendar.
      return startDate >= lo && startDate <= hi ? [startDate] : []
  }
}

/**
 * Fixed-day cadence (weekly / biweekly).
 *
 * The first hit is found by division, not iteration: for a 2015 start viewed in
 * 2050 this is two arithmetic ops, not 1,800 loop turns.
 */
function byDayInterval(startDate: IsoDate, lo: IsoDate, hi: IsoDate, interval: number): IsoDate[] {
  const step = Math.max(1, Math.trunc(interval))
  const gap = diffDays(startDate, lo)
  // `lo >= startDate` always, so `gap >= 0`; guard anyway.
  const firstStep = gap <= 0 ? 0 : Math.ceil(gap / step)

  const out: IsoDate[] = []
  for (let i = firstStep; out.length < MAX_OCCURRENCES; i += 1) {
    const date = addDays(startDate, i * step)
    if (date > hi) break
    // Defensive: `i` starts at the first step on/after `lo`, but a corrupt
    // startDate could put us behind it.
    if (date >= lo) out.push(date)
  }
  return out
}

/**
 * Calendar-month cadence (monthly = 1, yearly = 12).
 *
 * Each candidate is `startDate + k months` measured against the *original*
 * anchor day, which is what makes Jan 31 -> Feb 28 -> Mar 31 work. Stepping off
 * the previous occurrence instead would strand the series on the 28th.
 */
function byMonthInterval(
  startDate: IsoDate,
  lo: IsoDate,
  hi: IsoDate,
  monthsPerStep: number,
): IsoDate[] {
  const step = Math.max(1, Math.trunc(monthsPerStep))
  const start = parseIso(startDate)
  const anchorDay = start.getDate()
  const target = parseIso(lo)

  // Jump straight to the period containing `lo`.
  const monthGap =
    (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth())
  let k = monthGap <= 0 ? 0 : Math.floor(monthGap / step)

  const out: IsoDate[] = []
  while (out.length < MAX_OCCURRENCES) {
    const date = addMonthsClamped(startDate, k * step, anchorDay)
    if (date > hi) break
    if (date >= lo) out.push(date)
    k += 1
  }
  return out
}

/** The one or two days-of-month a semimonthly rule fires on, ascending, unique. */
function semimonthlyDays(event: BudgetEvent): number[] {
  const first = parseIso(event.startDate).getDate()
  const raw = event.recurrence?.secondDayOfMonth
  if (raw == null || !Number.isFinite(raw)) return [first]

  const second = Math.min(MAX_DAY_OF_MONTH, Math.max(1, Math.trunc(raw)))
  return second === first ? [first] : [first, second].sort((a, b) => a - b)
}

/**
 * Twice-monthly cadence.
 *
 * Both days clamp into the month independently, so a `[15, 31]` rule fires on
 * Feb 15 and Feb 28. When both days clamp onto the *same* date (e.g. `[28, 31]`
 * in February) the date is emitted once, not twice.
 */
function bySemimonthly(event: BudgetEvent, lo: IsoDate, hi: IsoDate): IsoDate[] {
  const days = semimonthlyDays(event)
  const cursor = parseIso(lo)
  let year = cursor.getFullYear()
  let monthIndex = cursor.getMonth()

  const out: IsoDate[] = []
  let guard = 0
  while (out.length < MAX_OCCURRENCES && guard < MAX_OCCURRENCES) {
    guard += 1
    if (isoFromParts(year, monthIndex, 1) > hi) break

    // A Set collapses the both-clamped-to-the-same-day case.
    const inMonth = [...new Set(days.map((day) => isoFromParts(year, monthIndex, day)))].sort()
    for (const date of inMonth) {
      // `lo` already sits at or after startDate, so this one check covers both
      // "inside the window" and "not before the series began".
      if (date >= lo && date <= hi) out.push(date)
    }

    monthIndex += 1
    if (monthIndex > 11) {
      monthIndex = 0
      year += 1
    }
  }
  return out
}

// ── Human-readable phrasing ────────────────────────────────────────────────

/**
 * UI phrasing for a rule: "Every 2 weeks", "Monthly on the 31st",
 * "Twice a month (1st & 15th) until Dec 31, 2027".
 */
export function describeRecurrence(event: BudgetEvent): string {
  const base = baseDescription(event)
  const until = event.recurrence?.until ?? null
  const frequency = event.recurrence?.frequency ?? 'once'

  // An end date on a one-off is meaningless — don't surface it.
  if (!until || frequency === 'once') return base
  return `${base} until ${formatUntilDate(until)}`
}

function baseDescription(event: BudgetEvent): string {
  const frequency = event.recurrence?.frequency ?? 'once'

  switch (frequency) {
    case 'once':
      return 'One time'
    case 'weekly':
      return 'Every week'
    case 'biweekly':
      return 'Every 2 weeks'
    case 'semimonthly': {
      if (event.recurrence?.secondDayOfMonth == null) return 'Twice a month'
      const [first, second] = semimonthlyDays(event)
      if (first === undefined) return 'Twice a month'
      if (second === undefined) return `Twice a month (${ordinal(first)})`
      return `Twice a month (${ordinal(first)} & ${ordinal(second)})`
    }
    case 'monthly':
      return `Monthly on the ${ordinal(parseIso(event.startDate).getDate())}`
    case 'yearly':
      return `Every year on ${formatShortDate(event.startDate)}`
    default:
      return 'One time'
  }
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th", 21 -> "21st". */
export function ordinal(value: number): string {
  const n = Math.trunc(value)
  const teens = Math.abs(n) % 100
  // 11th/12th/13th break the tens rule and are the classic off-by-one here.
  if (teens >= 11 && teens <= 13) return `${n}th`
  switch (Math.abs(n) % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

function formatUntilDate(date: IsoDate): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parseIso(date))
}
