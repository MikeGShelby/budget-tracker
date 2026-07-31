import { describe, expect, it } from 'vitest'

import { addDays, dayOfWeek } from './dates'
import { describeRecurrence, occurrencesInRange, ordinal } from './recurrence'
import type { BudgetEvent, IsoDate, Recurrence, RecurrenceFrequency } from './types'

interface EventOverrides {
  startDate: IsoDate
  frequency?: RecurrenceFrequency
  until?: IsoDate | null
  secondDayOfMonth?: number | null
  skippedDates?: IsoDate[]
  amountMinor?: number
  direction?: 'income' | 'expense'
  id?: string
  title?: string
}

function makeEvent(overrides: EventOverrides): BudgetEvent {
  const recurrence: Recurrence = {
    frequency: overrides.frequency ?? 'once',
    until: overrides.until ?? null,
    secondDayOfMonth: overrides.secondDayOfMonth ?? null,
  }
  return {
    id: overrides.id ?? 'evt-1',
    title: overrides.title ?? 'Test event',
    direction: overrides.direction ?? 'expense',
    amountMinor: overrides.amountMinor ?? 1000,
    categoryId: 'other-expense',
    startDate: overrides.startDate,
    recurrence,
    skippedDates: overrides.skippedDates ?? [],
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('occurrencesInRange — one-time events', () => {
  it('returns the start date when it falls inside the window', () => {
    const event = makeEvent({ startDate: '2026-03-15', frequency: 'once' })
    expect(occurrencesInRange(event, '2026-03-01', '2026-03-31')).toEqual(['2026-03-15'])
  })

  it('includes the start date on both inclusive window edges', () => {
    const event = makeEvent({ startDate: '2026-03-15', frequency: 'once' })
    expect(occurrencesInRange(event, '2026-03-15', '2026-03-15')).toEqual(['2026-03-15'])
  })

  it('returns nothing when the window is entirely before the start date', () => {
    const event = makeEvent({ startDate: '2026-03-15', frequency: 'once' })
    expect(occurrencesInRange(event, '2026-01-01', '2026-03-14')).toEqual([])
  })

  it('returns nothing when the window is entirely after the start date', () => {
    const event = makeEvent({ startDate: '2026-03-15', frequency: 'once' })
    expect(occurrencesInRange(event, '2026-03-16', '2026-12-31')).toEqual([])
  })
})

describe('occurrencesInRange — degenerate input', () => {
  it('returns [] when from is after to instead of throwing', () => {
    const event = makeEvent({ startDate: '2026-01-01', frequency: 'weekly' })
    expect(occurrencesInRange(event, '2026-06-30', '2026-01-01')).toEqual([])
  })

  it('returns [] for a range entirely before the start date of a repeating series', () => {
    const event = makeEvent({ startDate: '2026-06-01', frequency: 'weekly' })
    expect(occurrencesInRange(event, '2020-01-01', '2026-05-31')).toEqual([])
  })

  it('never emits dates before the start date even when from reaches further back', () => {
    const event = makeEvent({ startDate: '2026-03-10', frequency: 'weekly' })
    const dates = occurrencesInRange(event, '2020-01-01', '2026-03-31')
    expect(dates).toEqual(['2026-03-10', '2026-03-17', '2026-03-24', '2026-03-31'])
    for (const date of dates) expect(date >= '2026-03-10').toBe(true)
  })

  it('returns [] when until precedes the start date', () => {
    const event = makeEvent({
      startDate: '2026-06-01',
      frequency: 'monthly',
      until: '2026-05-31',
    })
    expect(occurrencesInRange(event, '2020-01-01', '2030-01-01')).toEqual([])
  })
})

describe('occurrencesInRange — weekly and biweekly', () => {
  it('steps every 7 days from the start date', () => {
    const event = makeEvent({ startDate: '2026-01-01', frequency: 'weekly' })
    expect(occurrencesInRange(event, '2026-01-01', '2026-02-01')).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
    ])
  })

  it('steps every 14 days for biweekly, never 7', () => {
    const event = makeEvent({ startDate: '2026-01-01', frequency: 'biweekly' })
    expect(occurrencesInRange(event, '2026-01-01', '2026-03-01')).toEqual([
      '2026-01-01',
      '2026-01-15',
      '2026-01-29',
      '2026-02-12',
      '2026-02-26',
    ])
  })

  it('holds the weekday across a spring-forward DST boundary', () => {
    // US DST begins 2026-03-08. A 23-hour day must not shift a Sunday series.
    const event = makeEvent({ startDate: '2026-03-01', frequency: 'weekly' })
    const dates = occurrencesInRange(event, '2026-03-01', '2026-03-29')
    expect(dates).toEqual([
      '2026-03-01',
      '2026-03-08',
      '2026-03-15',
      '2026-03-22',
      '2026-03-29',
    ])
    for (const date of dates) expect(dayOfWeek(date)).toBe(dayOfWeek('2026-03-01'))
  })

  it('holds the weekday across a fall-back DST boundary', () => {
    // US DST ends 2026-11-01; that day is 25 hours long.
    const event = makeEvent({ startDate: '2026-10-18', frequency: 'weekly' })
    const dates = occurrencesInRange(event, '2026-10-18', '2026-11-15')
    expect(dates).toEqual([
      '2026-10-18',
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
    ])
  })
})

describe('occurrencesInRange — monthly clamping and recovery', () => {
  it('recovers the 31st after clamping to February (Jan -> Feb -> Mar)', () => {
    const event = makeEvent({ startDate: '2026-01-31', frequency: 'monthly' })
    expect(occurrencesInRange(event, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31', // NOT 2026-03-28 — the anchor day must be recovered.
      '2026-04-30',
    ])
  })

  it('keeps recovering the 31st across a whole year', () => {
    const event = makeEvent({ startDate: '2026-01-31', frequency: 'monthly' })
    expect(occurrencesInRange(event, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ])
  })

  it('clamps the 31st to Feb 29 in a leap year, then recovers', () => {
    const event = makeEvent({ startDate: '2024-01-31', frequency: 'monthly' })
    expect(occurrencesInRange(event, '2024-01-01', '2024-04-30')).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
    ])
  })

  it('handles the 30th through leap and common Februaries', () => {
    const leap = makeEvent({ startDate: '2024-01-30', frequency: 'monthly' })
    expect(occurrencesInRange(leap, '2024-01-01', '2024-03-31')).toEqual([
      '2024-01-30',
      '2024-02-29',
      '2024-03-30',
    ])

    const common = makeEvent({ startDate: '2023-01-30', frequency: 'monthly' })
    expect(occurrencesInRange(common, '2023-01-01', '2023-03-31')).toEqual([
      '2023-01-30',
      '2023-02-28',
      '2023-03-30',
    ])
  })

  it('handles the 29th through leap and common Februaries', () => {
    const leap = makeEvent({ startDate: '2024-01-29', frequency: 'monthly' })
    expect(occurrencesInRange(leap, '2024-01-01', '2024-03-31')).toEqual([
      '2024-01-29',
      '2024-02-29', // exact hit, no clamping in a leap year
      '2024-03-29',
    ])

    const common = makeEvent({ startDate: '2023-01-29', frequency: 'monthly' })
    expect(occurrencesInRange(common, '2023-01-01', '2023-03-31')).toEqual([
      '2023-01-29',
      '2023-02-28',
      '2023-03-29',
    ])
  })

  it('does not drift when the window starts mid-series', () => {
    const event = makeEvent({ startDate: '2020-01-31', frequency: 'monthly' })
    // Jumping straight into 2026 must produce the same dates as walking there.
    expect(occurrencesInRange(event, '2026-02-01', '2026-05-31')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ])
  })

  it('lands exactly on a window that opens on an occurrence', () => {
    const event = makeEvent({ startDate: '2026-01-15', frequency: 'monthly' })
    expect(occurrencesInRange(event, '2026-04-15', '2026-06-15')).toEqual([
      '2026-04-15',
      '2026-05-15',
      '2026-06-15',
    ])
  })
})

describe('occurrencesInRange — yearly', () => {
  it('repeats the same month and day each year', () => {
    const event = makeEvent({ startDate: '2026-03-03', frequency: 'yearly' })
    expect(occurrencesInRange(event, '2026-01-01', '2029-12-31')).toEqual([
      '2026-03-03',
      '2027-03-03',
      '2028-03-03',
      '2029-03-03',
    ])
  })

  it('clamps Feb 29 to Feb 28 in common years and recovers in the next leap year', () => {
    const event = makeEvent({ startDate: '2024-02-29', frequency: 'yearly' })
    expect(occurrencesInRange(event, '2024-01-01', '2028-12-31')).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29', // recovered
    ])
  })

  it('jumps correctly into a far-future window', () => {
    const event = makeEvent({ startDate: '1990-07-04', frequency: 'yearly' })
    expect(occurrencesInRange(event, '2099-01-01', '2101-12-31')).toEqual([
      '2099-07-04',
      '2100-07-04',
      '2101-07-04',
    ])
  })
})

describe('occurrencesInRange — semimonthly', () => {
  it('fires on the 1st and 15th', () => {
    const event = makeEvent({
      startDate: '2026-01-01',
      frequency: 'semimonthly',
      secondDayOfMonth: 15,
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-02-28')).toEqual([
      '2026-01-01',
      '2026-01-15',
      '2026-02-01',
      '2026-02-15',
    ])
  })

  it('clamps the 31st rule to the end of February', () => {
    const event = makeEvent({
      startDate: '2026-01-15',
      frequency: 'semimonthly',
      secondDayOfMonth: 31,
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-15',
      '2026-01-31',
      '2026-02-15',
      '2026-02-28',
      '2026-03-15',
      '2026-03-31',
    ])
  })

  it('clamps the 31st rule to Feb 29 in a leap year', () => {
    const event = makeEvent({
      startDate: '2024-01-15',
      frequency: 'semimonthly',
      secondDayOfMonth: 31,
    })
    expect(occurrencesInRange(event, '2024-02-01', '2024-02-29')).toEqual([
      '2024-02-15',
      '2024-02-29',
    ])
  })

  it('emits a single date when both days clamp onto the same day', () => {
    const event = makeEvent({
      startDate: '2026-01-28',
      frequency: 'semimonthly',
      secondDayOfMonth: 31,
    })
    // February: the 28th and the clamped 31st collide — emit it once.
    expect(occurrencesInRange(event, '2026-02-01', '2026-02-28')).toEqual(['2026-02-28'])
    expect(occurrencesInRange(event, '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-28',
      '2026-01-31',
      '2026-02-28',
      '2026-03-28',
      '2026-03-31',
    ])
  })

  it('emits ascending order when the second day precedes the start day', () => {
    const event = makeEvent({
      startDate: '2026-01-15',
      frequency: 'semimonthly',
      secondDayOfMonth: 1,
    })
    // Jan 1 predates the series and must be suppressed; later months get both.
    expect(occurrencesInRange(event, '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-15',
      '2026-02-01',
      '2026-02-15',
      '2026-03-01',
      '2026-03-15',
    ])
  })

  it('falls back to a single monthly day when secondDayOfMonth is null', () => {
    const event = makeEvent({
      startDate: '2026-01-10',
      frequency: 'semimonthly',
      secondDayOfMonth: null,
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
    ])
  })

  it('stays ascending and unique over a long horizon', () => {
    const event = makeEvent({
      startDate: '2026-01-31',
      frequency: 'semimonthly',
      secondDayOfMonth: 30,
    })
    const dates = occurrencesInRange(event, '2026-01-01', '2028-12-31')
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)
    expect(new Set(dates).size).toBe(dates.length)
    // February collapses 30 and 31 onto the last day, so exactly one date there.
    expect(dates.filter((d) => d.startsWith('2026-02'))).toEqual(['2026-02-28'])
    expect(dates.filter((d) => d.startsWith('2028-02'))).toEqual(['2028-02-29'])
  })
})

describe('occurrencesInRange — until boundary', () => {
  it('includes an occurrence landing exactly on until', () => {
    const event = makeEvent({
      startDate: '2026-01-01',
      frequency: 'weekly',
      until: '2026-01-15',
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
    ])
  })

  it('excludes the occurrence one day past until', () => {
    const event = makeEvent({
      startDate: '2026-01-01',
      frequency: 'weekly',
      until: '2026-01-14',
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-01',
      '2026-01-08',
    ])
  })

  it('caps a monthly series inclusively', () => {
    const event = makeEvent({
      startDate: '2026-01-31',
      frequency: 'monthly',
      until: '2026-03-31',
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ])
  })

  it('caps a semimonthly series inclusively', () => {
    const event = makeEvent({
      startDate: '2026-01-01',
      frequency: 'semimonthly',
      secondDayOfMonth: 15,
      until: '2026-02-15',
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-01',
      '2026-01-15',
      '2026-02-01',
      '2026-02-15',
    ])
  })

  it('treats null until as unbounded', () => {
    const event = makeEvent({ startDate: '2026-01-01', frequency: 'yearly', until: null })
    expect(occurrencesInRange(event, '2120-01-01', '2120-12-31')).toEqual(['2120-01-01'])
  })
})

describe('occurrencesInRange — skipped dates', () => {
  it('removes exactly one occurrence and leaves the rest intact', () => {
    const event = makeEvent({
      startDate: '2026-01-01',
      frequency: 'weekly',
      skippedDates: ['2026-01-08'],
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-01-29')).toEqual([
      '2026-01-01',
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
    ])
  })

  it('removes several dates across a monthly series', () => {
    const event = makeEvent({
      startDate: '2026-01-31',
      frequency: 'monthly',
      skippedDates: ['2026-02-28', '2026-04-30'],
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ])
  })

  it('ignores skipped dates that never were occurrences', () => {
    const event = makeEvent({
      startDate: '2026-01-01',
      frequency: 'weekly',
      skippedDates: ['2026-01-09', '2019-05-05'],
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-01-22')).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
      '2026-01-22',
    ])
  })

  it('can empty a window completely', () => {
    const event = makeEvent({
      startDate: '2026-01-01',
      frequency: 'weekly',
      skippedDates: ['2026-01-01', '2026-01-08'],
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-01-14')).toEqual([])
  })

  it('can skip a one-off entirely', () => {
    const event = makeEvent({
      startDate: '2026-01-01',
      frequency: 'once',
      skippedDates: ['2026-01-01'],
    })
    expect(occurrencesInRange(event, '2026-01-01', '2026-01-31')).toEqual([])
  })
})

describe('occurrencesInRange — long-horizon performance', () => {
  it('finds the right first weekly date 35 years out without walking the gap', () => {
    // 2015-03-04 is a Wednesday; 2050-06-01 is also a Wednesday, so the window
    // opens exactly on an occurrence.
    const event = makeEvent({ startDate: '2015-03-04', frequency: 'weekly' })
    const dates = occurrencesInRange(event, '2050-06-01', '2050-06-30')
    expect(dates[0]).toBe('2050-06-01')
    expect(dates).toEqual([
      '2050-06-01',
      '2050-06-08',
      '2050-06-15',
      '2050-06-22',
      '2050-06-29',
    ])
  })

  it('rounds up to the next weekly hit when the window opens mid-cycle', () => {
    const event = makeEvent({ startDate: '2015-03-04', frequency: 'weekly' })
    const dates = occurrencesInRange(event, '2050-06-02', '2050-06-30')
    expect(dates[0]).toBe('2050-06-08')
    expect(dates).toEqual(['2050-06-08', '2050-06-15', '2050-06-22', '2050-06-29'])
  })

  it('expands 5,000 far-future weekly windows well inside a day-by-day budget', () => {
    // A naive scan from 2015 forward is ~12,800 iterations per call. Measured on
    // this suite: seeking arithmetically runs the loop below in ~80ms, while a
    // day-by-day scan takes ~6.9s. The 1.5s budget sits an order of magnitude
    // above the former and well below the latter, so it discriminates without
    // being timing-flaky.
    const event = makeEvent({ startDate: '2015-03-04', frequency: 'weekly' })
    const started = performance.now()
    let total = 0
    for (let i = 0; i < 5000; i += 1) {
      total += occurrencesInRange(event, '2050-06-01', '2050-06-30').length
    }
    const elapsed = performance.now() - started
    expect(total).toBe(25_000)
    expect(elapsed).toBeLessThan(1500)
  })

  it('expands a 1900 weekly series viewed in 2200 without scanning the century gap', () => {
    // ~15,700 weeks of history. A day-by-day walk is ~110,000 steps per call.
    const event = makeEvent({ startDate: '1900-01-01', frequency: 'weekly' })
    const started = performance.now()
    let dates: IsoDate[] = []
    for (let i = 0; i < 500; i += 1) {
      dates = occurrencesInRange(event, '2200-03-01', '2200-03-31')
    }
    const elapsed = performance.now() - started
    // 1900-01-01 was a Monday, and the series has held Mondays ever since.
    expect(dates[0]).toBe('2200-03-03')
    expect(dates).toEqual([
      '2200-03-03',
      '2200-03-10',
      '2200-03-17',
      '2200-03-24',
      '2200-03-31',
    ])
    for (const date of dates) expect(dayOfWeek(date)).toBe(dayOfWeek('1900-01-01'))
    expect(elapsed).toBeLessThan(1500)
  })

  it('seeks a monthly series from 1990 into 2100 without drifting off the anchor', () => {
    const event = makeEvent({ startDate: '1990-01-31', frequency: 'monthly' })
    expect(occurrencesInRange(event, '2100-01-01', '2100-04-30')).toEqual([
      '2100-01-31',
      '2100-02-28', // 2100 is not a leap year
      '2100-03-31',
      '2100-04-30',
    ])
  })

  it('seeks a semimonthly series across a century', () => {
    const event = makeEvent({
      startDate: '1985-06-15',
      frequency: 'semimonthly',
      secondDayOfMonth: 31,
    })
    expect(occurrencesInRange(event, '2085-02-01', '2085-03-15')).toEqual([
      '2085-02-15',
      '2085-02-28',
      '2085-03-15',
    ])
  })
})

describe('occurrencesInRange — consistency', () => {
  it('a whole-year expansion equals the concatenation of its months', () => {
    const event = makeEvent({
      startDate: '2026-01-31',
      frequency: 'semimonthly',
      secondDayOfMonth: 14,
    })
    const whole = occurrencesInRange(event, '2026-01-01', '2026-12-31')

    const monthly: IsoDate[] = []
    for (let month = 1; month <= 12; month += 1) {
      const mm = String(month).padStart(2, '0')
      const first: IsoDate = `2026-${mm}-01`
      const last: IsoDate = month === 12 ? '2026-12-31' : addDays(`2026-${String(month + 1).padStart(2, '0')}-01`, -1)
      monthly.push(...occurrencesInRange(event, first, last))
    }
    expect(whole).toEqual(monthly)
  })

  it('is pure — repeated calls return equal results and mutating one does not affect the next', () => {
    const event = makeEvent({ startDate: '2026-01-01', frequency: 'weekly' })
    const first = occurrencesInRange(event, '2026-01-01', '2026-02-28')
    first.push('tampered')
    const second = occurrencesInRange(event, '2026-01-01', '2026-02-28')
    expect(second).not.toContain('tampered')
    expect(second.length).toBe(first.length - 1)
  })
})

describe('describeRecurrence', () => {
  it('describes a one-time event', () => {
    expect(describeRecurrence(makeEvent({ startDate: '2026-01-01', frequency: 'once' }))).toBe(
      'One time',
    )
  })

  it('describes weekly and biweekly', () => {
    expect(describeRecurrence(makeEvent({ startDate: '2026-01-01', frequency: 'weekly' }))).toBe(
      'Every week',
    )
    expect(describeRecurrence(makeEvent({ startDate: '2026-01-01', frequency: 'biweekly' }))).toBe(
      'Every 2 weeks',
    )
  })

  it('describes semimonthly with both days in ascending order', () => {
    const event = makeEvent({
      startDate: '2026-01-15',
      frequency: 'semimonthly',
      secondDayOfMonth: 1,
    })
    expect(describeRecurrence(event)).toBe('Twice a month (1st & 15th)')
  })

  it('collapses semimonthly when both days are the same', () => {
    const event = makeEvent({
      startDate: '2026-01-15',
      frequency: 'semimonthly',
      secondDayOfMonth: 15,
    })
    expect(describeRecurrence(event)).toBe('Twice a month (15th)')
  })

  it('describes semimonthly with no second day configured', () => {
    const event = makeEvent({
      startDate: '2026-01-15',
      frequency: 'semimonthly',
      secondDayOfMonth: null,
    })
    expect(describeRecurrence(event)).toBe('Twice a month')
  })

  it('describes monthly with the anchor day', () => {
    expect(describeRecurrence(makeEvent({ startDate: '2026-01-31', frequency: 'monthly' }))).toBe(
      'Monthly on the 31st',
    )
    expect(describeRecurrence(makeEvent({ startDate: '2026-01-01', frequency: 'monthly' }))).toBe(
      'Monthly on the 1st',
    )
  })

  it('uses correct ordinal suffixes for the tricky days', () => {
    const day = (d: string) =>
      describeRecurrence(makeEvent({ startDate: `2026-01-${d}`, frequency: 'monthly' }))
    expect(day('01')).toBe('Monthly on the 1st')
    expect(day('02')).toBe('Monthly on the 2nd')
    expect(day('03')).toBe('Monthly on the 3rd')
    expect(day('04')).toBe('Monthly on the 4th')
    expect(day('11')).toBe('Monthly on the 11th')
    expect(day('12')).toBe('Monthly on the 12th')
    expect(day('13')).toBe('Monthly on the 13th')
    expect(day('21')).toBe('Monthly on the 21st')
    expect(day('22')).toBe('Monthly on the 22nd')
    expect(day('23')).toBe('Monthly on the 23rd')
    expect(day('31')).toBe('Monthly on the 31st')
  })

  it('describes yearly with a short month and day', () => {
    expect(describeRecurrence(makeEvent({ startDate: '2026-03-03', frequency: 'yearly' }))).toBe(
      'Every year on Mar 3',
    )
    expect(describeRecurrence(makeEvent({ startDate: '2024-02-29', frequency: 'yearly' }))).toBe(
      'Every year on Feb 29',
    )
  })

  it('appends an inclusive end date', () => {
    const event = makeEvent({
      startDate: '2026-01-15',
      frequency: 'monthly',
      until: '2027-12-31',
    })
    expect(describeRecurrence(event)).toBe('Monthly on the 15th until Dec 31, 2027')
  })

  it('appends the end date to weekly and semimonthly phrasing too', () => {
    expect(
      describeRecurrence(
        makeEvent({ startDate: '2026-01-01', frequency: 'weekly', until: '2026-06-30' }),
      ),
    ).toBe('Every week until Jun 30, 2026')
    expect(
      describeRecurrence(
        makeEvent({
          startDate: '2026-01-01',
          frequency: 'semimonthly',
          secondDayOfMonth: 15,
          until: '2026-06-30',
        }),
      ),
    ).toBe('Twice a month (1st & 15th) until Jun 30, 2026')
  })

  it('does not append an end date to a one-time event', () => {
    const event = makeEvent({ startDate: '2026-01-15', frequency: 'once', until: '2027-12-31' })
    expect(describeRecurrence(event)).toBe('One time')
  })
})

describe('ordinal', () => {
  it('handles the full 1..31 range without a wrong suffix', () => {
    const expected = [
      '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th',
      '11th', '12th', '13th', '14th', '15th', '16th', '17th', '18th', '19th', '20th',
      '21st', '22nd', '23rd', '24th', '25th', '26th', '27th', '28th', '29th', '30th', '31st',
    ]
    for (let i = 1; i <= 31; i += 1) expect(ordinal(i)).toBe(expected[i - 1])
  })

  it('keeps the teens rule beyond 100', () => {
    expect(ordinal(111)).toBe('111th')
    expect(ordinal(112)).toBe('112th')
    expect(ordinal(101)).toBe('101st')
  })
})
