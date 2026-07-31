import { describe, expect, it } from 'vitest'

import { addDays, eachDay } from './dates'
import { balanceOn, occurrencesOn, projectRange } from './projection'
import type { RangeProjection } from './projection'
import type { BudgetEvent, CategoryId, DayProjection, IsoDate, Recurrence, RecurrenceFrequency, Settings } from './types'

interface EventOverrides {
  startDate: IsoDate
  amountMinor: number
  direction: 'income' | 'expense'
  id?: string
  title?: string
  categoryId?: CategoryId
  frequency?: RecurrenceFrequency
  until?: IsoDate | null
  secondDayOfMonth?: number | null
  skippedDates?: IsoDate[]
}

let sequence = 0

function makeEvent(overrides: EventOverrides): BudgetEvent {
  sequence += 1
  const recurrence: Recurrence = {
    frequency: overrides.frequency ?? 'once',
    until: overrides.until ?? null,
    secondDayOfMonth: overrides.secondDayOfMonth ?? null,
  }
  return {
    id: overrides.id ?? `evt-${sequence}`,
    title: overrides.title ?? `Event ${sequence}`,
    direction: overrides.direction,
    amountMinor: overrides.amountMinor,
    categoryId:
      overrides.categoryId ?? (overrides.direction === 'income' ? 'other-income' : 'other-expense'),
    startDate: overrides.startDate,
    recurrence,
    skippedDates: overrides.skippedDates ?? [],
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeSettings(startingBalanceMinor: number, startingBalanceDate: IsoDate): Settings {
  return {
    startingBalanceMinor,
    startingBalanceDate,
    currency: 'USD',
    locale: 'en-US',
    weekStartsOn: 0,
  }
}

/** `days.get()` is `DayProjection | undefined` under noUncheckedIndexedAccess. */
function dayAt(projection: RangeProjection, date: IsoDate): DayProjection {
  const day = projection.days.get(date)
  if (!day) throw new Error(`expected a DayProjection for ${date}`)
  return day
}

describe('projectRange — the worked example', () => {
  const settings = makeSettings(0, '2026-01-01')
  const events = [
    makeEvent({
      id: 'income-1',
      title: 'Paycheck',
      direction: 'income',
      amountMinor: 200_000,
      startDate: '2026-01-01',
      categoryId: 'paycheck',
    }),
    makeEvent({
      id: 'expense-1',
      title: 'Rent',
      direction: 'expense',
      amountMinor: 50_000,
      startDate: '2026-01-10',
      categoryId: 'rent',
    }),
  ]

  it('applies the same-day income on top of the starting balance', () => {
    const projection = projectRange(events, settings, '2026-01-01', '2026-01-31')
    expect(projection.openingBalanceMinor).toBe(0)
    expect(dayAt(projection, '2026-01-01').balanceMinor).toBe(200_000)
    expect(dayAt(projection, '2026-01-01').deltaMinor).toBe(200_000)
    expect(dayAt(projection, '2026-01-01').hasChange).toBe(true)
  })

  it('carries the balance forward across quiet days', () => {
    const projection = projectRange(events, settings, '2026-01-01', '2026-01-31')
    const quiet = dayAt(projection, '2026-01-05')
    expect(quiet.balanceMinor).toBe(200_000)
    expect(quiet.deltaMinor).toBe(0)
    expect(quiet.hasChange).toBe(false)
    expect(quiet.occurrences).toEqual([])
  })

  it('subtracts the expense on its day', () => {
    const projection = projectRange(events, settings, '2026-01-01', '2026-01-31')
    expect(dayAt(projection, '2026-01-09').balanceMinor).toBe(200_000)
    expect(dayAt(projection, '2026-01-10').balanceMinor).toBe(150_000)
    expect(dayAt(projection, '2026-01-10').deltaMinor).toBe(-50_000)
    expect(dayAt(projection, '2026-01-31').balanceMinor).toBe(150_000)
  })

  it('reports totals as positive magnitudes and the closing balance at the end of `to`', () => {
    const projection = projectRange(events, settings, '2026-01-01', '2026-01-31')
    expect(projection.totalIncomeMinor).toBe(200_000)
    expect(projection.totalExpenseMinor).toBe(50_000)
    expect(projection.closingBalanceMinor).toBe(150_000)
    expect(projection.from).toBe('2026-01-01')
    expect(projection.to).toBe('2026-01-31')
  })

  it('rolls prior activity into the opening balance of a later window', () => {
    const projection = projectRange(events, settings, '2026-01-05', '2026-01-31')
    expect(projection.openingBalanceMinor).toBe(200_000)
    expect(projection.totalIncomeMinor).toBe(0)
    expect(projection.totalExpenseMinor).toBe(50_000)
    expect(projection.closingBalanceMinor).toBe(150_000)
    expect(projection.days.has('2026-01-01')).toBe(false)
  })
})

describe('projectRange — day map coverage', () => {
  const settings = makeSettings(100_000, '2026-01-01')

  it('covers every date in the window inclusive, even with no events', () => {
    const projection = projectRange([], settings, '2026-02-01', '2026-02-28')
    expect(projection.days.size).toBe(28)
    for (const date of eachDay('2026-02-01', '2026-02-28')) {
      const day = dayAt(projection, date)
      expect(day.date).toBe(date)
      expect(day.balanceMinor).toBe(100_000)
      expect(day.hasChange).toBe(false)
    }
  })

  it('covers a leap February', () => {
    const projection = projectRange([], settings, '2024-02-01', '2024-02-29')
    expect(projection.days.size).toBe(29)
    expect(projection.days.has('2024-02-29')).toBe(true)
  })

  it('gives each quiet day its own occurrences array, not a shared singleton', () => {
    const projection = projectRange([], settings, '2026-02-01', '2026-02-03')
    const a = dayAt(projection, '2026-02-01').occurrences
    const b = dayAt(projection, '2026-02-02').occurrences
    expect(a).not.toBe(b)
    a.push({
      key: 'x::y',
      eventId: 'x',
      date: '2026-02-01',
      title: 'tamper',
      direction: 'income',
      amountMinor: 1,
      signedMinor: 1,
      categoryId: 'other-income',
      isRecurring: false,
    })
    expect(dayAt(projection, '2026-02-02').occurrences).toHaveLength(0)
  })

  it('keeps the map ordered ascending so callers can iterate it directly', () => {
    const projection = projectRange([], settings, '2026-03-01', '2026-03-10')
    expect([...projection.days.keys()]).toEqual(eachDay('2026-03-01', '2026-03-10'))
  })
})

describe('projectRange — degenerate windows', () => {
  const settings = makeSettings(25_000, '2026-01-01')

  it('returns an empty projection when from is after to rather than throwing', () => {
    const events = [
      makeEvent({ direction: 'income', amountMinor: 500, startDate: '2026-01-05' }),
    ]
    const projection = projectRange(events, settings, '2026-06-30', '2026-01-01')
    expect(projection.days.size).toBe(0)
    expect(projection.totalIncomeMinor).toBe(0)
    expect(projection.totalExpenseMinor).toBe(0)
    expect(projection.closingBalanceMinor).toBe(projection.openingBalanceMinor)
    expect(projection.from).toBe('2026-06-30')
    expect(projection.to).toBe('2026-01-01')
  })

  it('handles a single-day window', () => {
    const events = [
      makeEvent({ direction: 'expense', amountMinor: 5_000, startDate: '2026-01-05' }),
    ]
    const projection = projectRange(events, settings, '2026-01-05', '2026-01-05')
    expect(projection.days.size).toBe(1)
    expect(projection.openingBalanceMinor).toBe(25_000)
    expect(projection.closingBalanceMinor).toBe(20_000)
  })
})

describe('projectRange — the starting-balance cutoff', () => {
  it('ignores occurrences dated before the starting balance entirely', () => {
    const settings = makeSettings(10_000, '2026-02-01')
    const stale = makeEvent({
      direction: 'expense',
      amountMinor: 999_999,
      startDate: '2026-01-15',
    })

    // The January expense predates the known balance; replaying it would
    // double-count money the user already accounted for.
    expect(balanceOn([stale], settings, '2026-02-01')).toBe(10_000)

    const january = projectRange([stale], settings, '2026-01-01', '2026-01-31')
    expect(january.openingBalanceMinor).toBe(10_000)
    expect(january.closingBalanceMinor).toBe(10_000)
    expect(january.totalExpenseMinor).toBe(0)
    expect(dayAt(january, '2026-01-15').hasChange).toBe(false)
    expect(dayAt(january, '2026-01-15').occurrences).toEqual([])
  })

  it('keeps a recurring series that straddles the cutoff from the later side only', () => {
    const settings = makeSettings(0, '2026-02-01')
    const weekly = makeEvent({
      direction: 'expense',
      amountMinor: 1_000,
      startDate: '2026-01-01',
      frequency: 'weekly',
    })
    // Jan 1/8/15/22/29 are ignored; Feb 5/12/19/26 count.
    const projection = projectRange([weekly], settings, '2026-01-01', '2026-02-28')
    expect(projection.totalExpenseMinor).toBe(4_000)
    expect(projection.closingBalanceMinor).toBe(-4_000)
    expect(dayAt(projection, '2026-01-29').hasChange).toBe(false)
    expect(dayAt(projection, '2026-02-05').hasChange).toBe(true)
  })

  it('applies the starting-balance day’s own events on top of the balance', () => {
    const settings = makeSettings(50_000, '2026-02-01')
    const sameDay = makeEvent({
      direction: 'income',
      amountMinor: 20_000,
      startDate: '2026-02-01',
    })
    expect(balanceOn([sameDay], settings, '2026-02-01')).toBe(70_000)
    expect(balanceOn([sameDay], settings, '2026-01-31')).toBe(50_000)
  })
})

describe('projectRange — negative balances', () => {
  it('projects from a negative starting balance', () => {
    const settings = makeSettings(-50_000, '2026-01-01')
    const projection = projectRange([], settings, '2026-01-01', '2026-01-31')
    expect(projection.openingBalanceMinor).toBe(-50_000)
    expect(dayAt(projection, '2026-01-31').balanceMinor).toBe(-50_000)
  })

  it('crosses zero upward and reports the exact crossing day', () => {
    const settings = makeSettings(-50_000, '2026-01-01')
    const events = [
      makeEvent({ direction: 'income', amountMinor: 200_000, startDate: '2026-01-05' }),
    ]
    const projection = projectRange(events, settings, '2026-01-01', '2026-01-10')
    expect(dayAt(projection, '2026-01-04').balanceMinor).toBe(-50_000)
    expect(dayAt(projection, '2026-01-05').balanceMinor).toBe(150_000)
  })

  it('crosses zero downward without clamping at zero', () => {
    const settings = makeSettings(30_000, '2026-01-01')
    const events = [
      makeEvent({
        direction: 'expense',
        amountMinor: 20_000,
        startDate: '2026-01-02',
        frequency: 'weekly',
      }),
    ]
    const projection = projectRange(events, settings, '2026-01-01', '2026-01-31')
    expect(dayAt(projection, '2026-01-02').balanceMinor).toBe(10_000)
    expect(dayAt(projection, '2026-01-09').balanceMinor).toBe(-10_000)
    expect(dayAt(projection, '2026-01-16').balanceMinor).toBe(-30_000)
    expect(dayAt(projection, '2026-01-31').balanceMinor).toBe(-70_000)
    expect(projection.closingBalanceMinor).toBe(-70_000)
  })

  it('lands exactly on zero without sign weirdness', () => {
    const settings = makeSettings(10_000, '2026-01-01')
    const events = [
      makeEvent({ direction: 'expense', amountMinor: 10_000, startDate: '2026-01-02' }),
    ]
    const projection = projectRange(events, settings, '2026-01-01', '2026-01-03')
    expect(dayAt(projection, '2026-01-02').balanceMinor).toBe(0)
    expect(Object.is(dayAt(projection, '2026-01-02').balanceMinor, -0)).toBe(false)
  })
})

describe('occurrence shape and ordering', () => {
  const settings = makeSettings(0, '2026-01-01')

  it('builds the documented key, sign and recurring flag', () => {
    const once = makeEvent({
      id: 'one-off',
      title: 'Bonus',
      direction: 'income',
      amountMinor: 12_345,
      startDate: '2026-01-04',
      categoryId: 'bonus',
    })
    const series = makeEvent({
      id: 'series',
      title: 'Netflix',
      direction: 'expense',
      amountMinor: 1_599,
      startDate: '2026-01-04',
      frequency: 'monthly',
      categoryId: 'subscription',
    })

    const projection = projectRange([once, series], settings, '2026-01-01', '2026-01-31')
    const day = dayAt(projection, '2026-01-04')
    expect(day.occurrences.map((o) => o.key)).toEqual([
      'one-off::2026-01-04',
      'series::2026-01-04',
    ])
    expect(day.occurrences[0]?.signedMinor).toBe(12_345)
    expect(day.occurrences[0]?.isRecurring).toBe(false)
    expect(day.occurrences[0]?.categoryId).toBe('bonus')
    expect(day.occurrences[1]?.signedMinor).toBe(-1_599)
    expect(day.occurrences[1]?.amountMinor).toBe(1_599)
    expect(day.occurrences[1]?.isRecurring).toBe(true)
    expect(day.deltaMinor).toBe(12_345 - 1_599)
  })

  it('sorts income first, then by descending magnitude', () => {
    const events = [
      makeEvent({ id: 'e-small', direction: 'expense', amountMinor: 200, startDate: '2026-01-04' }),
      makeEvent({ id: 'i-small', direction: 'income', amountMinor: 100, startDate: '2026-01-04' }),
      makeEvent({ id: 'e-big', direction: 'expense', amountMinor: 900, startDate: '2026-01-04' }),
      makeEvent({ id: 'i-big', direction: 'income', amountMinor: 500, startDate: '2026-01-04' }),
    ]
    const projection = projectRange(events, settings, '2026-01-01', '2026-01-31')
    expect(dayAt(projection, '2026-01-04').occurrences.map((o) => o.eventId)).toEqual([
      'i-big',
      'i-small',
      'e-big',
      'e-small',
    ])
  })

  it('breaks magnitude ties deterministically regardless of input order', () => {
    const build = (ids: string[]) =>
      ids.map((id) =>
        makeEvent({
          id,
          title: id.toUpperCase(),
          direction: 'expense',
          amountMinor: 500,
          startDate: '2026-01-04',
        }),
      )
    const forward = projectRange(build(['alpha', 'bravo', 'charlie']), settings, '2026-01-04', '2026-01-04')
    const reversed = projectRange(build(['charlie', 'bravo', 'alpha']), settings, '2026-01-04', '2026-01-04')
    expect(dayAt(forward, '2026-01-04').occurrences.map((o) => o.eventId)).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ])
    expect(dayAt(reversed, '2026-01-04').occurrences.map((o) => o.eventId)).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ])
  })
})

describe('occurrencesOn', () => {
  it('returns just that day, in calendar order', () => {
    const events = [
      makeEvent({ id: 'rent', direction: 'expense', amountMinor: 150_000, startDate: '2026-01-01', frequency: 'monthly' }),
      makeEvent({ id: 'pay', direction: 'income', amountMinor: 300_000, startDate: '2026-01-01', frequency: 'biweekly' }),
      makeEvent({ id: 'gym', direction: 'expense', amountMinor: 4_500, startDate: '2026-01-03' }),
    ]
    expect(occurrencesOn(events, '2026-01-01').map((o) => o.eventId)).toEqual(['pay', 'rent'])
    expect(occurrencesOn(events, '2026-01-02')).toEqual([])
    expect(occurrencesOn(events, '2026-01-03').map((o) => o.eventId)).toEqual(['gym'])
    expect(occurrencesOn(events, '2026-02-01').map((o) => o.eventId)).toEqual(['rent'])
  })

  it('respects skipped dates', () => {
    const events = [
      makeEvent({
        id: 'weekly',
        direction: 'expense',
        amountMinor: 1_000,
        startDate: '2026-01-01',
        frequency: 'weekly',
        skippedDates: ['2026-01-08'],
      }),
    ]
    expect(occurrencesOn(events, '2026-01-01')).toHaveLength(1)
    expect(occurrencesOn(events, '2026-01-08')).toHaveLength(0)
    expect(occurrencesOn(events, '2026-01-15')).toHaveLength(1)
  })

  it('matches the day map produced by projectRange', () => {
    const settings = makeSettings(0, '2026-01-01')
    const events = [
      makeEvent({ id: 'a', direction: 'income', amountMinor: 700, startDate: '2026-01-05', frequency: 'weekly' }),
      makeEvent({ id: 'b', direction: 'expense', amountMinor: 300, startDate: '2026-01-05', frequency: 'monthly' }),
    ]
    const projection = projectRange(events, settings, '2026-01-01', '2026-02-28')
    for (const date of eachDay('2026-01-01', '2026-02-28')) {
      expect(dayAt(projection, date).occurrences.map((o) => o.key)).toEqual(
        occurrencesOn(events, date).map((o) => o.key),
      )
    }
  })
})

describe('balanceOn', () => {
  const settings = makeSettings(100_000, '2026-01-01')
  const events = [
    makeEvent({ direction: 'income', amountMinor: 250_000, startDate: '2026-01-15', frequency: 'monthly' }),
    makeEvent({ direction: 'expense', amountMinor: 180_000, startDate: '2026-01-01', frequency: 'monthly' }),
  ]

  it('is the balance at the END of the day', () => {
    expect(balanceOn(events, settings, '2026-01-01')).toBe(100_000 - 180_000)
    expect(balanceOn(events, settings, '2026-01-14')).toBe(-80_000)
    expect(balanceOn(events, settings, '2026-01-15')).toBe(170_000)
  })

  it('returns the starting balance for dates before the starting-balance date', () => {
    expect(balanceOn(events, settings, '2025-12-31')).toBe(100_000)
    expect(balanceOn(events, settings, '2020-01-01')).toBe(100_000)
  })

  it('agrees with projectRange on every day of a window', () => {
    const projection = projectRange(events, settings, '2026-01-01', '2026-06-30')
    for (const date of eachDay('2026-01-01', '2026-06-30')) {
      expect(dayAt(projection, date).balanceMinor).toBe(balanceOn(events, settings, date))
    }
  })

  it('agrees with the projection opening balance', () => {
    const projection = projectRange(events, settings, '2026-04-01', '2026-04-30')
    expect(projection.openingBalanceMinor).toBe(balanceOn(events, settings, '2026-03-31'))
    expect(projection.closingBalanceMinor).toBe(balanceOn(events, settings, '2026-04-30'))
  })

  it('returns the starting balance when there are no events', () => {
    expect(balanceOn([], settings, '2030-01-01')).toBe(100_000)
  })
})

describe('integer money — no drift', () => {
  it('sums 1,000 occurrences of 3,333 cents to exactly 3,333,000', () => {
    const start: IsoDate = '2000-01-03'
    const settings = makeSettings(0, start)
    const events = [
      makeEvent({
        direction: 'expense',
        amountMinor: 3_333,
        startDate: start,
        frequency: 'weekly',
      }),
    ]
    const last = addDays(start, 999 * 7)
    const projection = projectRange(events, settings, start, last)

    expect(projection.totalExpenseMinor).toBe(3_333_000)
    expect(projection.totalIncomeMinor).toBe(0)
    expect(projection.closingBalanceMinor).toBe(-3_333_000)
    expect(Number.isInteger(projection.closingBalanceMinor)).toBe(true)
    expect(balanceOn(events, settings, last)).toBe(-3_333_000)

    // The same total, reached by walking the day map one delta at a time.
    let walked = 0
    let changeDays = 0
    for (const day of projection.days.values()) {
      walked += day.deltaMinor
      if (day.hasChange) changeDays += 1
    }
    expect(walked).toBe(-3_333_000)
    expect(changeDays).toBe(1000)
  })

  it('keeps awkward cent amounts exact across many events on one day', () => {
    const settings = makeSettings(0, '2026-01-01')
    const events = Array.from({ length: 300 }, (_, i) =>
      makeEvent({
        id: `e-${i}`,
        direction: i % 2 === 0 ? 'income' : 'expense',
        amountMinor: 1_999,
        startDate: '2026-01-01',
      }),
    )
    const projection = projectRange(events, settings, '2026-01-01', '2026-01-01')
    expect(projection.totalIncomeMinor).toBe(150 * 1_999)
    expect(projection.totalExpenseMinor).toBe(150 * 1_999)
    expect(projection.closingBalanceMinor).toBe(0)
  })
})

describe('projectRange — invariants', () => {
  const settings = makeSettings(-12_345, '2026-01-01')
  const events = [
    makeEvent({ direction: 'income', amountMinor: 320_000, startDate: '2026-01-02', frequency: 'biweekly' }),
    makeEvent({ direction: 'expense', amountMinor: 195_000, startDate: '2026-01-31', frequency: 'monthly' }),
    makeEvent({
      direction: 'expense',
      amountMinor: 6_050,
      startDate: '2026-01-01',
      frequency: 'semimonthly',
      secondDayOfMonth: 15,
    }),
    makeEvent({ direction: 'income', amountMinor: 75_000, startDate: '2026-03-10', until: null }),
    makeEvent({
      direction: 'expense',
      amountMinor: 2_400,
      startDate: '2026-01-05',
      frequency: 'weekly',
      skippedDates: ['2026-02-02'],
      until: '2026-04-30',
    }),
  ]

  const projection = projectRange(events, settings, '2026-01-01', '2026-06-30')

  it('has deltaMinor equal to the sum of that day’s occurrences', () => {
    for (const day of projection.days.values()) {
      const summed = day.occurrences.reduce((acc, o) => acc + o.signedMinor, 0)
      expect(day.deltaMinor).toBe(summed)
      expect(day.hasChange).toBe(day.occurrences.length > 0)
    }
  })

  it('has a balance that is the opening balance plus every delta so far', () => {
    let running = projection.openingBalanceMinor
    for (const day of projection.days.values()) {
      running += day.deltaMinor
      expect(day.balanceMinor).toBe(running)
    }
    expect(projection.closingBalanceMinor).toBe(running)
  })

  it('has totals matching the signed sum of all deltas', () => {
    let net = 0
    for (const day of projection.days.values()) net += day.deltaMinor
    expect(projection.totalIncomeMinor - projection.totalExpenseMinor).toBe(net)
    expect(projection.totalIncomeMinor).toBeGreaterThan(0)
    expect(projection.totalExpenseMinor).toBeGreaterThan(0)
  })

  it('stitches together across adjacent windows', () => {
    const q1 = projectRange(events, settings, '2026-01-01', '2026-03-31')
    const q2 = projectRange(events, settings, '2026-04-01', '2026-06-30')
    expect(q2.openingBalanceMinor).toBe(q1.closingBalanceMinor)
    expect(q2.closingBalanceMinor).toBe(projection.closingBalanceMinor)
    expect(q1.totalIncomeMinor + q2.totalIncomeMinor).toBe(projection.totalIncomeMinor)
    expect(q1.totalExpenseMinor + q2.totalExpenseMinor).toBe(projection.totalExpenseMinor)
  })

  it('honours the until cap of the weekly series', () => {
    // The capped weekly event stops after 2026-04-30, so May and June only carry
    // the remaining rules.
    const may1 = dayAt(projection, '2026-05-04')
    expect(may1.occurrences.some((o) => o.amountMinor === 2_400)).toBe(false)
    expect(dayAt(projection, '2026-04-27').occurrences.some((o) => o.amountMinor === 2_400)).toBe(
      true,
    )
  })

  it('drops exactly the skipped occurrence', () => {
    expect(dayAt(projection, '2026-01-26').occurrences.some((o) => o.amountMinor === 2_400)).toBe(
      true,
    )
    expect(dayAt(projection, '2026-02-02').occurrences.some((o) => o.amountMinor === 2_400)).toBe(
      false,
    )
    expect(dayAt(projection, '2026-02-09').occurrences.some((o) => o.amountMinor === 2_400)).toBe(
      true,
    )
  })

  it('is pure — two identical calls agree, and mutating one result does not leak', () => {
    const first = projectRange(events, settings, '2026-01-01', '2026-02-28')
    dayAt(first, '2026-01-15').occurrences.length = 0
    first.days.delete('2026-01-20')

    const second = projectRange(events, settings, '2026-01-01', '2026-02-28')
    expect(second.days.size).toBe(59)
    expect(dayAt(second, '2026-01-15').occurrences.length).toBeGreaterThan(0)
    expect(second.closingBalanceMinor).toBe(
      projectRange(events, settings, '2026-01-01', '2026-02-28').closingBalanceMinor,
    )
  })
})

describe('projectRange — month-end rules on the calendar', () => {
  it('shows a 31st-of-the-month rent on Feb 28 and back on Mar 31', () => {
    const settings = makeSettings(500_000, '2026-01-01')
    const rent = makeEvent({
      id: 'rent',
      direction: 'expense',
      amountMinor: 100_000,
      startDate: '2026-01-31',
      frequency: 'monthly',
    })
    const projection = projectRange([rent], settings, '2026-01-01', '2026-03-31')
    expect(dayAt(projection, '2026-01-31').hasChange).toBe(true)
    expect(dayAt(projection, '2026-02-28').hasChange).toBe(true)
    expect(dayAt(projection, '2026-03-28').hasChange).toBe(false)
    expect(dayAt(projection, '2026-03-31').hasChange).toBe(true)
    expect(projection.closingBalanceMinor).toBe(200_000)
  })
})
