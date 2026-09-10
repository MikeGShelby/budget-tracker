/**
 * Core domain contracts.
 *
 * Two rules hold everywhere in this app:
 *  1. Money is an integer count of minor units (cents). Never a float.
 *  2. Dates are ISO `yyyy-MM-dd` strings in the user's *local* civil calendar —
 *     never `Date` objects in stored state, and never UTC timestamps. A budget
 *     event on the 1st is on the 1st regardless of timezone.
 */

/** ISO `yyyy-MM-dd`. */
export type IsoDate = string

/** Whether an event adds to or subtracts from the balance. */
export type EventDirection = 'income' | 'expense'

export type RecurrenceFrequency =
  | 'once'
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'yearly'

export interface Recurrence {
  frequency: RecurrenceFrequency
  /**
   * Inclusive ISO date after which no further occurrences are generated.
   * `null` means the series repeats indefinitely.
   */
  until: IsoDate | null
  /**
   * Only meaningful for `semimonthly`: the second day of the month to fire on.
   * The first is taken from the event's `startDate`. Values above the length of
   * a given month clamp to that month's final day.
   */
  secondDayOfMonth: number | null
}

export interface BudgetEvent {
  id: string
  title: string
  direction: EventDirection
  /** Positive integer, minor units. `direction` supplies the sign. */
  amountMinor: number
  categoryId: CategoryId
  /** Date of the first occurrence. */
  startDate: IsoDate
  recurrence: Recurrence
  /** Individual occurrence dates the user deleted out of a series. */
  skippedDates: IsoDate[]
  note: string
  createdAt: string
  updatedAt: string
}

/** A single materialized instance of an event on a specific date. */
export interface Occurrence {
  /** Stable identity for React keys and skip-lists: `${eventId}::${date}`. */
  key: string
  eventId: string
  date: IsoDate
  title: string
  direction: EventDirection
  /** Positive magnitude, minor units. */
  amountMinor: number
  /** Signed: positive for income, negative for expense. */
  signedMinor: number
  categoryId: CategoryId
  /** True when this came from a repeating series rather than a one-off. */
  isRecurring: boolean
}

/** Everything the calendar needs to render one day cell. */
export interface DayProjection {
  date: IsoDate
  occurrences: Occurrence[]
  /** Net signed change occurring on this day. */
  deltaMinor: number
  /** Running balance as of the end of this day. */
  balanceMinor: number
  /** True when at least one occurrence lands on this day. */
  hasChange: boolean
}

export interface Settings {
  /** Opening balance, minor units. May be negative. */
  startingBalanceMinor: number
  /** The date `startingBalanceMinor` is true as of, before that day's events. */
  startingBalanceDate: IsoDate
  /** ISO 4217, e.g. `USD`. */
  currency: string
  /** BCP 47, e.g. `en-US`. */
  locale: string
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1
}

/** Category ids are a closed set so stored data stays valid across releases. */
export type CategoryId =
  // income
  | 'paycheck'
  | 'bonus'
  | 'freelance'
  | 'refund'
  | 'interest'
  | 'gift'
  | 'other-income'
  // housing
  | 'mortgage'
  | 'rent'
  | 'utilities'
  | 'internet'
  | 'phone'
  // debt
  | 'credit-card'
  | 'loan'
  | 'car-payment'
  // living
  | 'groceries'
  | 'dining'
  | 'transport'
  | 'insurance'
  | 'medical'
  | 'childcare'
  | 'education'
  | 'subscription'
  | 'shopping'
  | 'travel'
  | 'savings'
  | 'other-expense'
