/**
 * Balance projection.
 *
 * Everything the calendar renders is derived here: for a window of days, the
 * occurrences landing on each day and the running balance at the end of it.
 *
 * The model has exactly one fixed point — `settings.startingBalanceMinor` is
 * true at the *start* of `settings.startingBalanceDate`, before that day's own
 * events are applied. Anything dated earlier is deliberately ignored: the user
 * told us what the balance already was, so replaying older transactions on top
 * of it would double-count them.
 *
 * All arithmetic is integer minor units. There is no floating point anywhere in
 * this file, so a thousand additions of 3,333 cents is exactly 3,333,000.
 */
import { addDays, eachDay } from './dates'
import { occurrencesInRange } from './recurrence'
import type { BudgetEvent, DayProjection, IsoDate, Occurrence, Settings } from './types'

export interface RangeProjection {
  from: IsoDate
  to: IsoDate
  /** Balance at the END of the day before `from`. */
  openingBalanceMinor: number
  /** Balance at the END of `to`. */
  closingBalanceMinor: number
  /** Every date in `[from, to]` inclusive, including days with no activity. */
  days: Map<IsoDate, DayProjection>
  /** Positive magnitude of income within `[from, to]`. */
  totalIncomeMinor: number
  /** Positive magnitude of expense within `[from, to]`. */
  totalExpenseMinor: number
}

/**
 * Project `[from, to]`.
 *
 * Pure: given the same inputs it returns the same output, and it holds no cache
 * across calls. (A module-level memo keyed on the `events` array identity would
 * go stale the moment a store mutated an event in place — the kind of bug that
 * shows a wrong balance and never reproduces.)
 */
export function projectRange(
  events: BudgetEvent[],
  settings: Settings,
  from: IsoDate,
  to: IsoDate,
): RangeProjection {
  const openingBalanceMinor = balanceOn(events, settings, addDays(from, -1))

  // Degenerate window: report the opening balance and an empty day map rather
  // than throwing, so a caller mid-navigation can't crash the calendar.
  if (from > to) {
    return {
      from,
      to,
      openingBalanceMinor,
      closingBalanceMinor: openingBalanceMinor,
      days: new Map(),
      totalIncomeMinor: 0,
      totalExpenseMinor: 0,
    }
  }

  // Occurrences dated before the known balance never count — not toward the
  // balance, not toward the totals, not in a day's occurrence list. Keeping
  // that consistent is what makes `deltaMinor` always equal the sum of the
  // day's occurrences and the balance always carry.
  const effectiveFrom = maxDate(from, settings.startingBalanceDate)
  const byDate =
    events.length === 0 || effectiveFrom > to
      ? EMPTY_BUCKETS
      : collectByDate(events, effectiveFrom, to)

  const days = new Map<IsoDate, DayProjection>()
  let running = openingBalanceMinor
  let totalIncomeMinor = 0
  let totalExpenseMinor = 0

  for (const date of eachDay(from, to)) {
    // A fresh array per quiet day: callers own what they get back, and a shared
    // singleton would let one component's `.push()` corrupt every other day.
    const occurrences = byDate.get(date) ?? []
    let deltaMinor = 0

    for (const occurrence of occurrences) {
      deltaMinor += occurrence.signedMinor
      if (occurrence.direction === 'income') totalIncomeMinor += occurrence.amountMinor
      else totalExpenseMinor += occurrence.amountMinor
    }

    running += deltaMinor
    days.set(date, {
      date,
      occurrences,
      deltaMinor,
      balanceMinor: running,
      hasChange: occurrences.length > 0,
    })
  }

  return {
    from,
    to,
    openingBalanceMinor,
    closingBalanceMinor: running,
    days,
    totalIncomeMinor,
    totalExpenseMinor,
  }
}

/**
 * Balance at the END of `date` — i.e. that day's own occurrences are included.
 *
 * Dates before `settings.startingBalanceDate` all report the starting balance:
 * we have no information about that stretch of history, so the line is flat
 * rather than fabricated.
 */
export function balanceOn(events: BudgetEvent[], settings: Settings, date: IsoDate): number {
  const base = settings.startingBalanceMinor
  if (date < settings.startingBalanceDate) return base
  if (events.length === 0) return base

  let total = base
  for (const event of events) {
    const count = occurrencesInRange(event, settings.startingBalanceDate, date).length
    if (count === 0) continue
    // Multiply rather than accumulate: same integer result, one operation.
    total += count * signedMinorFor(event)
  }
  return total
}

/**
 * A single day's occurrences, in the same order the calendar shows them.
 *
 * Unlike `projectRange` this is a raw calendar query — it takes no `Settings`
 * and therefore applies no starting-balance cutoff.
 */
export function occurrencesOn(events: BudgetEvent[], date: IsoDate): Occurrence[] {
  const out: Occurrence[] = []
  for (const event of events) {
    if (occurrencesInRange(event, date, date).length > 0) out.push(toOccurrence(event, date))
  }
  return out.sort(compareOccurrences)
}

// ── internals ──────────────────────────────────────────────────────────────

/** Read-only sentinel for "nothing lands in this window"; never handed out. */
const EMPTY_BUCKETS: Map<IsoDate, Occurrence[]> = new Map()

function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b
}

/** Positive magnitude, regardless of how the amount was stored. */
function magnitudeFor(event: BudgetEvent): number {
  return Math.abs(event.amountMinor)
}

function signedMinorFor(event: BudgetEvent): number {
  const magnitude = magnitudeFor(event)
  return event.direction === 'income' ? magnitude : -magnitude
}

function toOccurrence(event: BudgetEvent, date: IsoDate): Occurrence {
  return {
    key: `${event.id}::${date}`,
    eventId: event.id,
    date,
    title: event.title,
    direction: event.direction,
    amountMinor: magnitudeFor(event),
    signedMinor: signedMinorFor(event),
    categoryId: event.categoryId,
    isRecurring: (event.recurrence?.frequency ?? 'once') !== 'once',
  }
}

/**
 * Income first, then largest magnitude first, so the biggest mover of the day
 * reads at the top. Title and id break ties, keeping the order stable across
 * renders instead of depending on the sort implementation.
 */
function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.direction !== b.direction) return a.direction === 'income' ? -1 : 1
  if (a.amountMinor !== b.amountMinor) return b.amountMinor - a.amountMinor
  const byTitle = a.title.localeCompare(b.title)
  if (byTitle !== 0) return byTitle
  return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0
}

function collectByDate(
  events: BudgetEvent[],
  from: IsoDate,
  to: IsoDate,
): Map<IsoDate, Occurrence[]> {
  const byDate = new Map<IsoDate, Occurrence[]>()

  for (const event of events) {
    for (const date of occurrencesInRange(event, from, to)) {
      const occurrence = toOccurrence(event, date)
      const bucket = byDate.get(date)
      if (bucket) bucket.push(occurrence)
      else byDate.set(date, [occurrence])
    }
  }

  for (const bucket of byDate.values()) bucket.sort(compareOccurrences)
  return byDate
}
