/**
 * First-run demo data.
 *
 * The calendar only makes its point when there is something on it, so a fresh
 * install opens onto a realistic month rather than an empty grid. Everything is
 * anchored to the `today` passed in — rent on the 1st of *this* month, payday
 * every other week from the 5th — so the demo is never stale.
 *
 * The numbers are chosen to tell the story the app exists to tell: $3,200 on the
 * 1st, rent and the credit-card bill knock it down to ~$740 by the 2nd, it
 * grinds down to a ~$640 trough on the 4th, then payday snaps it back over
 * $3,000. That shape is the whole pitch for a running-balance calendar.
 */
import { addDays, isoFromParts, parseIso, startOfMonth } from '../domain/dates'
import type {
  BudgetEvent,
  CategoryId,
  EventDirection,
  IsoDate,
  RecurrenceFrequency,
  Settings,
} from '../domain/types'
import { DEFAULT_SETTINGS } from './repository'

interface SeedSpec {
  id: string
  title: string
  direction: EventDirection
  /** Positive integer, minor units. */
  amountMinor: number
  categoryId: CategoryId
  startDate: IsoDate
  frequency: RecurrenceFrequency
  note?: string
}

/** The given day of `today`'s month, clamped into short months. */
function dayOfThisMonth(today: IsoDate, day: number): IsoDate {
  const anchor = parseIso(today)
  return isoFromParts(anchor.getFullYear(), anchor.getMonth(), day)
}

function toEvent(spec: SeedSpec, timestamp: string): BudgetEvent {
  return {
    id: spec.id,
    title: spec.title,
    direction: spec.direction,
    amountMinor: spec.amountMinor,
    categoryId: spec.categoryId,
    startDate: spec.startDate,
    recurrence: {
      frequency: spec.frequency,
      until: null,
      secondDayOfMonth: null,
    },
    skippedDates: [],
    note: spec.note ?? '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/**
 * A month's worth of recognisable bills, income and spending, relative to
 * `today`. Ids are stable (`seed-*`) so seeding twice — a double-invoked effect
 * in React StrictMode, say — overwrites rather than duplicates.
 */
export function buildSeedEvents(today: IsoDate): BudgetEvent[] {
  const timestamp = new Date().toISOString()
  const day = (n: number): IsoDate => dayOfThisMonth(today, n)

  const specs: SeedSpec[] = [
    // ── Income ────────────────────────────────────────────────────────────
    {
      id: 'seed-paycheck',
      title: 'Paycheck',
      direction: 'income',
      amountMinor: 240_000, // $2,400.00
      categoryId: 'paycheck',
      startDate: day(5),
      frequency: 'biweekly',
      note: 'Direct deposit, every other week',
    },
    {
      id: 'seed-tax-refund',
      title: 'Tax refund',
      direction: 'income',
      amountMinor: 68_000, // $680.00
      categoryId: 'refund',
      // Kept ahead of today so the upcoming list is never empty on first open.
      startDate: addDays(today, 9),
      frequency: 'once',
    },

    // ── Housing & fixed bills ─────────────────────────────────────────────
    {
      id: 'seed-rent',
      title: 'Rent',
      direction: 'expense',
      amountMinor: 185_000, // $1,850.00
      categoryId: 'rent',
      startDate: day(1),
      frequency: 'monthly',
    },
    {
      id: 'seed-credit-card',
      title: 'Credit card payment',
      direction: 'expense',
      amountMinor: 61_000, // $610.00
      categoryId: 'credit-card',
      startDate: day(2),
      frequency: 'monthly',
      note: 'Statement balance',
    },
    {
      id: 'seed-internet',
      title: 'Internet',
      direction: 'expense',
      amountMinor: 7_999, // $79.99
      categoryId: 'internet',
      startDate: day(3),
      frequency: 'monthly',
    },
    {
      id: 'seed-phone',
      title: 'Phone',
      direction: 'expense',
      amountMinor: 6_500, // $65.00
      categoryId: 'phone',
      startDate: day(8),
      frequency: 'monthly',
    },
    {
      id: 'seed-car-insurance',
      title: 'Car insurance',
      direction: 'expense',
      amountMinor: 14_800, // $148.00
      categoryId: 'insurance',
      startDate: day(10),
      frequency: 'monthly',
    },
    {
      id: 'seed-utilities',
      title: 'Electric & gas',
      direction: 'expense',
      amountMinor: 18_640, // $186.40
      categoryId: 'utilities',
      startDate: day(12),
      frequency: 'monthly',
    },

    // ── Subscriptions ─────────────────────────────────────────────────────
    {
      id: 'seed-streaming',
      title: 'Streaming bundle',
      direction: 'expense',
      amountMinor: 1_899, // $18.99
      categoryId: 'subscription',
      startDate: day(4),
      frequency: 'monthly',
    },
    {
      id: 'seed-music',
      title: 'Music subscription',
      direction: 'expense',
      amountMinor: 1_099, // $10.99
      categoryId: 'subscription',
      startDate: day(16),
      frequency: 'monthly',
    },

    // ── Living ────────────────────────────────────────────────────────────
    {
      id: 'seed-groceries',
      title: 'Groceries',
      direction: 'expense',
      amountMinor: 13_275, // $132.75
      categoryId: 'groceries',
      startDate: day(6),
      frequency: 'weekly',
      note: 'Weekly shop',
    },
    {
      id: 'seed-dentist',
      title: 'Dentist visit',
      direction: 'expense',
      amountMinor: 22_800, // $228.00
      categoryId: 'medical',
      startDate: addDays(today, 4),
      frequency: 'once',
    },
  ]

  return specs.map((spec) => toEvent(spec, timestamp))
}

/** ~$3,200 in the account as of the 1st of `today`'s month. */
export function buildSeedSettings(today: IsoDate): Settings {
  return {
    ...DEFAULT_SETTINGS,
    startingBalanceMinor: 320_000, // $3,200.00
    startingBalanceDate: startOfMonth(today),
  }
}
