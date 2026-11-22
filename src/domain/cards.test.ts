import { describe, expect, it } from 'vitest'
import {
  addMonthsToKey,
  applyLiabilitySnapshot,
  cardOccurrencesInRange,
  closingDateFor,
  defaultStatusFor,
  dueDateFor,
  findHandEnteredCardPayments,
  needsUpdate,
  nextDueDate,
  resolvePayment,
} from './cards'
import type { BudgetEvent, CardStatement, CreditCard, MonthKey } from './types'

const T = '2026-11-01T00:00:00.000Z'

function stmt(amountMinor: number, status: CardStatement['status'] = 'closed'): CardStatement {
  return { amountMinor, status, source: 'manual', updatedAt: T }
}

function card(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'sapphire',
    name: 'Chase Sapphire',
    issuer: 'chase',
    last4: '1234',
    dueDay: 15,
    closingDay: 18,
    statements: {},
    linkedAccountId: null,
    createdAt: T,
    updatedAt: T,
    ...overrides,
  }
}

describe('month keys', () => {
  it('rolls across year boundaries in both directions', () => {
    expect(addMonthsToKey('2026-12', 1)).toBe('2027-01')
    expect(addMonthsToKey('2027-01', -1)).toBe('2026-12')
    expect(addMonthsToKey('2026-11', 14)).toBe('2028-01')
    expect(addMonthsToKey('2026-03', -15)).toBe('2024-12')
  })
})

describe('due dates', () => {
  it('clamps a 31st card into short months and recovers in long ones', () => {
    const c = card({ dueDay: 31 })
    expect(dueDateFor(c, '2027-02')).toBe('2027-02-28')
    expect(dueDateFor(c, '2028-02')).toBe('2028-02-29')
    expect(dueDateFor(c, '2027-03')).toBe('2027-03-31')
    expect(dueDateFor(c, '2027-04')).toBe('2027-04-30')
  })

  it('treats a payment due today as the next payment, not last month’s', () => {
    expect(nextDueDate(card(), '2026-11-15')).toBe('2026-11-15')
    expect(nextDueDate(card(), '2026-11-16')).toBe('2026-12-15')
    expect(nextDueDate(card(), '2026-12-31')).toBe('2027-01-15')
  })
})

describe('statement closing dates', () => {
  it('uses the last closing day strictly before the due date', () => {
    // Due the 15th, closes the 18th: Dec 15 pays the Nov 18 statement.
    expect(closingDateFor(card(), '2026-12')).toBe('2026-11-18')
    // Due the 28th, closes the 1st: closes earlier in the same month.
    expect(closingDateFor(card({ dueDay: 28, closingDay: 1 }), '2026-12')).toBe('2026-12-01')
    // A closing day equal to the due day belongs to the previous month.
    expect(closingDateFor(card({ dueDay: 15, closingDay: 15 }), '2026-12')).toBe('2026-11-15')
  })

  it('clamps the closing day too', () => {
    expect(closingDateFor(card({ dueDay: 25, closingDay: 31 }), '2027-03')).toBe('2027-02-28')
  })

  it('returns null when the closing day is unknown', () => {
    expect(closingDateFor(card({ closingDay: null }), '2026-12')).toBeNull()
  })
})

describe('defaultStatusFor', () => {
  it('is exact when the closing day is known', () => {
    const c = card()
    // Dec 15 statement closes Nov 18.
    expect(defaultStatusFor(c, '2026-12', '2026-11-18')).toBe('open')
    expect(defaultStatusFor(c, '2026-12', '2026-11-19')).toBe('closed')
    expect(defaultStatusFor(c, '2027-01', '2026-11-22')).toBe('open')
  })

  it('without a closing day, assumes the next payment closed and later ones open', () => {
    const c = card({ closingDay: null })
    expect(defaultStatusFor(c, '2026-12', '2026-11-22')).toBe('closed')
    expect(defaultStatusFor(c, '2027-01', '2026-11-22')).toBe('open')
  })
})

describe('resolvePayment', () => {
  it('uses the entered amount, flagged as an estimate only when the statement is open', () => {
    const c = card({ statements: { '2026-12': stmt(84_210), '2027-01': stmt(12_000, 'open') } })
    expect(resolvePayment(c, '2026-12')).toMatchObject({
      amountMinor: 84_210,
      basis: 'entered',
      isEstimate: false,
      dueDate: '2026-12-15',
    })
    expect(resolvePayment(c, '2027-01')).toMatchObject({ amountMinor: 12_000, isEstimate: true })
  })

  it('carries the most recent earlier amount forward as an estimate', () => {
    const c = card({ statements: { '2026-10': stmt(50_000), '2026-12': stmt(84_210) } })
    expect(resolvePayment(c, '2027-03')).toMatchObject({
      amountMinor: 84_210,
      basis: 'carried',
      carriedFrom: '2026-12',
      isEstimate: true,
    })
    // A gap between two entries carries from the earlier one, never the later.
    expect(resolvePayment(c, '2026-11')).toMatchObject({ amountMinor: 50_000, carriedFrom: '2026-10' })
  })

  it('knows nothing before the first entry, so no past payment is invented', () => {
    const c = card({ statements: { '2026-12': stmt(84_210) } })
    expect(resolvePayment(c, '2026-11')).toBeNull()
    expect(resolvePayment(card(), '2026-12')).toBeNull()
  })

  it('orders month keys correctly across a year boundary', () => {
    const c = card({ statements: { '2026-12': stmt(1), '2027-01': stmt(2), '2026-09': stmt(3) } })
    expect(resolvePayment(c, '2027-02')?.carriedFrom).toBe('2027-01')
    expect(resolvePayment(c, '2026-11')?.carriedFrom).toBe('2026-09')
  })
})

describe('cardOccurrencesInRange', () => {
  it('emits one payment per month on the due day', () => {
    const c = card({ statements: { '2026-12': stmt(84_210) } })
    const out = cardOccurrencesInRange(c, '2026-12-01', '2027-02-28')
    expect(out.map((o) => [o.date, o.amountMinor, o.isEstimate])).toEqual([
      ['2026-12-15', 84_210, false],
      ['2027-01-15', 84_210, true],
      ['2027-02-15', 84_210, true],
    ])
  })

  it('shapes each payment as an expense tagged with its card', () => {
    const [o] = cardOccurrencesInRange(card({ statements: { '2026-12': stmt(500) } }), '2026-12-15', '2026-12-15')
    expect(o).toMatchObject({
      key: 'card::sapphire::2026-12-15',
      cardId: 'sapphire',
      title: 'Chase Sapphire',
      direction: 'expense',
      signedMinor: -500,
      categoryId: 'credit-card',
    })
  })

  it('respects the window edges exactly', () => {
    const c = card({ statements: { '2026-12': stmt(500) } })
    expect(cardOccurrencesInRange(c, '2026-12-16', '2027-01-14')).toEqual([])
    expect(cardOccurrencesInRange(c, '2026-12-15', '2026-12-15')).toHaveLength(1)
    expect(cardOccurrencesInRange(c, '2027-01-15', '2027-01-15')).toHaveLength(1)
  })

  it('skips a $0 month, and a $0 entry stops the carry-forward', () => {
    const c = card({ statements: { '2026-12': stmt(500), '2027-01': stmt(0) } })
    const out = cardOccurrencesInRange(c, '2026-12-01', '2027-03-31')
    expect(out.map((o) => o.date)).toEqual(['2026-12-15'])
  })

  it('lands a 31st card on the last day of February', () => {
    const c = card({ dueDay: 31, statements: { '2027-01': stmt(500) } })
    const out = cardOccurrencesInRange(c, '2027-02-01', '2027-03-31')
    expect(out.map((o) => o.date)).toEqual(['2027-02-28', '2027-03-31'])
  })

  it('returns nothing for a backwards window', () => {
    expect(cardOccurrencesInRange(card({ statements: { '2026-12': stmt(1) } }), '2027-01-01', '2026-01-01')).toEqual([])
  })
})

describe('applyLiabilitySnapshot', () => {
  const NOW = '2026-11-22T12:00:00.000Z'
  const statementOf = (c: CreditCard, key: MonthKey) => c.statements[key]

  it('books the issued statement as final and new charges as an open estimate', () => {
    // Statement closed Nov 18 at $842.10, due Dec 15. Since then $120 charged.
    const next = applyLiabilitySnapshot(
      card(),
      {
        currentBalanceMinor: 96_210,
        lastStatementBalanceMinor: 84_210,
        lastStatementIssueDate: '2026-11-18',
        nextPaymentDueDate: '2026-12-15',
        lastPaymentAmountMinor: 70_000,
        lastPaymentDate: '2026-11-14',
      },
      NOW,
      '2026-11-22',
    )
    expect(statementOf(next, '2026-12')).toMatchObject({ amountMinor: 84_210, status: 'closed', source: 'linked' })
    expect(statementOf(next, '2027-01')).toMatchObject({ amountMinor: 12_000, status: 'open', source: 'linked' })
  })

  it('adds back a payment made since the statement when working out new charges', () => {
    // Paid the $842.10 statement early on Nov 20; current balance is only the
    // $120 of new charges. New charges must still read $120, not -$722.10.
    const next = applyLiabilitySnapshot(
      card(),
      {
        currentBalanceMinor: 12_000,
        lastStatementBalanceMinor: 84_210,
        lastStatementIssueDate: '2026-11-18',
        nextPaymentDueDate: '2026-12-15',
        lastPaymentAmountMinor: 84_210,
        lastPaymentDate: '2026-11-20',
      },
      NOW,
      '2026-11-22',
    )
    expect(statementOf(next, '2027-01')?.amountMinor).toBe(12_000)
    expect(statementOf(next, '2026-12')?.amountMinor).toBe(84_210)
  })

  it('never books a negative amount (credits and refunds)', () => {
    const next = applyLiabilitySnapshot(
      card(),
      {
        currentBalanceMinor: -5_000,
        lastStatementBalanceMinor: 0,
        lastStatementIssueDate: '2026-11-18',
        nextPaymentDueDate: '2026-12-15',
        lastPaymentAmountMinor: null,
        lastPaymentDate: null,
      },
      NOW,
      '2026-11-22',
    )
    expect(statementOf(next, '2027-01')?.amountMinor).toBe(0)
  })

  it('without a statement yet, owes the current balance on the next due date', () => {
    const next = applyLiabilitySnapshot(
      card(),
      {
        currentBalanceMinor: 30_000,
        lastStatementBalanceMinor: null,
        lastStatementIssueDate: null,
        nextPaymentDueDate: null,
        lastPaymentAmountMinor: null,
        lastPaymentDate: null,
      },
      NOW,
      '2026-11-22',
    )
    expect(statementOf(next, '2026-12')).toMatchObject({ amountMinor: 30_000, status: 'open' })
  })

  it('keeps older months and leaves the input card untouched', () => {
    const original = card({ statements: { '2026-10': stmt(40_000) } })
    const next = applyLiabilitySnapshot(
      original,
      {
        currentBalanceMinor: 1,
        lastStatementBalanceMinor: 1,
        lastStatementIssueDate: '2026-11-18',
        nextPaymentDueDate: '2026-12-15',
        lastPaymentAmountMinor: null,
        lastPaymentDate: null,
      },
      NOW,
      '2026-11-22',
    )
    expect(statementOf(next, '2026-10')?.amountMinor).toBe(40_000)
    expect(Object.keys(original.statements)).toEqual(['2026-10'])
    expect(next.updatedAt).toBe(NOW)
  })
})

describe('needsUpdate', () => {
  // Due the 15th, closes the 18th: the Dec 15 statement closes Nov 18.
  it('flags a card once its statement has closed with nothing entered', () => {
    expect(needsUpdate(card(), '2026-11-18')).toBe(false)
    expect(needsUpdate(card(), '2026-11-19')).toBe(true)
  })

  it('still flags a closed statement that only has an open estimate', () => {
    const c = card({ statements: { '2026-12': stmt(50_000, 'open') } })
    expect(needsUpdate(c, '2026-11-22')).toBe(true)
  })

  it('clears once the final balance is entered', () => {
    const c = card({ statements: { '2026-12': stmt(84_210, 'closed') } })
    expect(needsUpdate(c, '2026-11-22')).toBe(false)
  })

  it('does not nag about a statement that has not closed yet', () => {
    // Dec 16: Dec 15 is paid, next is Jan 15, which closes Dec 18.
    const c = card({ statements: { '2026-12': stmt(84_210, 'closed') } })
    expect(needsUpdate(c, '2026-12-16')).toBe(false)
    expect(needsUpdate(c, '2026-12-19')).toBe(true)
  })

  it('without a closing day, flags an empty next payment', () => {
    expect(needsUpdate(card({ closingDay: null }), '2026-11-22')).toBe(true)
  })
})

describe('findHandEnteredCardPayments', () => {
  const ev = (over: Partial<BudgetEvent>): BudgetEvent => ({
    id: over.id ?? over.title ?? 'e',
    title: 'Something',
    direction: 'expense',
    amountMinor: 1000,
    categoryId: 'other-expense',
    startDate: '2026-12-15',
    recurrence: { frequency: 'once', until: null, secondDayOfMonth: null },
    skippedDates: [],
    note: '',
    createdAt: T,
    updatedAt: T,
    ...over,
  })
  const today = '2026-11-22'
  const cards = [card(), card({ id: 'dc', name: 'Double Cash', issuer: 'citi' })]

  it('finds upcoming payments by category, card name, or bank name', () => {
    const found = findHandEnteredCardPayments(
      [
        ev({ id: 'cat', title: 'Card bill', categoryId: 'credit-card', startDate: '2026-12-20' }),
        ev({ id: 'name', title: 'Pay Double Cash', startDate: '2026-12-09' }),
        ev({ id: 'bank', title: 'CHASE payment', startDate: '2026-12-15' }),
        ev({ id: 'rent', title: 'Rent', startDate: '2026-12-01' }),
      ],
      cards,
      today,
    )
    expect(found.map((f) => f.event.id)).toEqual(['name', 'bank', 'cat'])
  })

  it('ignores past one-offs, income, and anything when no cards exist', () => {
    const events = [
      ev({ id: 'past', title: 'Chase', startDate: '2026-11-15' }),
      ev({ id: 'refund', title: 'Chase refund', direction: 'income', categoryId: 'refund' }),
    ]
    expect(findHandEnteredCardPayments(events, cards, today)).toEqual([])
    expect(findHandEnteredCardPayments([ev({ categoryId: 'credit-card' })], [], today)).toEqual([])
  })

  it('reports the next date of a repeating payment, and skips a finished series', () => {
    const monthly = { frequency: 'monthly' as const, until: null, secondDayOfMonth: null }
    const found = findHandEnteredCardPayments(
      [
        ev({ id: 'live', title: 'Chase Sapphire', startDate: '2026-01-15', recurrence: monthly }),
        ev({ id: 'ended', title: 'Chase', startDate: '2026-01-15', recurrence: { ...monthly, until: '2026-10-31' } }),
      ],
      cards,
      today,
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ nextDate: '2026-12-15' })
  })
})
