/**
 * Credit card payments.
 *
 * A card is paid in full on the same day every month, but the amount changes
 * every month. Modelling that as one event per month means hunting the calendar
 * for this month's copy to edit it; instead a card stores one amount per due
 * month and this module turns those amounts into calendar payments.
 *
 * Two rules decide what a month shows:
 *
 *  1. A month with an entered amount uses it. If that statement is still open
 *     the amount will keep growing, so the payment is marked an estimate.
 *  2. A month with no entry reuses the most recent earlier entry, marked as an
 *     estimate. That keeps the forecast honest months ahead without asking for
 *     a number nobody knows yet. Months before the first entry show nothing, so
 *     adding a card never invents payments in the past.
 *
 * Everything here is pure and works in integer minor units.
 */
import { addDays, isoFromParts, parseIso } from './dates'
import { occurrencesInRange, ordinal } from './recurrence'
import type {
  BudgetEvent,
  CardIssuer,
  CardStatement,
  CreditCard,
  IsoDate,
  MonthKey,
  Occurrence,
  StatementStatus,
} from './types'

// ── Issuers ─────────────────────────────────────────────────────────────────

export interface IssuerInfo {
  id: CardIssuer
  label: string
  /** `oklch` hue for the card swatch. Colour only, never a logo. */
  hue: number
}

export const ISSUERS: readonly IssuerInfo[] = [
  { id: 'chase', label: 'Chase', hue: 255 },
  { id: 'citi', label: 'Citi', hue: 232 },
  { id: 'fidelity', label: 'Fidelity', hue: 150 },
  { id: 'amex', label: 'American Express', hue: 215 },
  { id: 'capital-one', label: 'Capital One', hue: 22 },
  { id: 'discover', label: 'Discover', hue: 55 },
  { id: 'bank-of-america', label: 'Bank of America', hue: 12 },
  { id: 'wells-fargo', label: 'Wells Fargo', hue: 40 },
  { id: 'us-bank', label: 'U.S. Bank', hue: 262 },
  { id: 'barclays', label: 'Barclays', hue: 225 },
  { id: 'apple', label: 'Apple Card', hue: 300 },
  { id: 'other', label: 'Other', hue: 275 },
] as const

const ISSUER_BY_ID = new Map<CardIssuer, IssuerInfo>(ISSUERS.map((i) => [i.id, i]))

export function getIssuer(id: CardIssuer): IssuerInfo {
  return ISSUER_BY_ID.get(id) ?? (ISSUER_BY_ID.get('other') as IssuerInfo)
}

// ── Month keys ──────────────────────────────────────────────────────────────

export function monthKeyOf(date: IsoDate): MonthKey {
  return date.slice(0, 7)
}

function monthParts(key: MonthKey): { year: number; monthIndex: number } {
  const [y, m] = key.split('-').map(Number)
  return { year: y ?? 1970, monthIndex: (m ?? 1) - 1 }
}

export function addMonthsToKey(key: MonthKey, months: number): MonthKey {
  const { year, monthIndex } = monthParts(key)
  const total = year * 12 + monthIndex + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = total - nextYear * 12 + 1
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
}

export function formatMonthKey(key: MonthKey, locale = 'en-US'): string {
  const { year, monthIndex } = monthParts(key)
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(year, monthIndex, 1),
  )
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** The payment date in a given month, clamped (a 31st card pays Feb 28/29). */
export function dueDateFor(card: Pick<CreditCard, 'dueDay'>, key: MonthKey): IsoDate {
  const { year, monthIndex } = monthParts(key)
  return isoFromParts(year, monthIndex, card.dueDay)
}

/** The first due date on or after `today`. */
export function nextDueDate(card: Pick<CreditCard, 'dueDay'>, today: IsoDate): IsoDate {
  const thisMonth = dueDateFor(card, monthKeyOf(today))
  return thisMonth >= today ? thisMonth : dueDateFor(card, addMonthsToKey(monthKeyOf(today), 1))
}

export function nextDueMonth(card: Pick<CreditCard, 'dueDay'>, today: IsoDate): MonthKey {
  return monthKeyOf(nextDueDate(card, today))
}

/**
 * When the statement paid in `key` closes: the last closing day strictly before
 * that month's due date. A card due on the 15th that closes on the 18th pays
 * Dec 15 for the statement that closed Nov 18.
 */
export function closingDateFor(
  card: Pick<CreditCard, 'dueDay' | 'closingDay'>,
  key: MonthKey,
): IsoDate | null {
  if (card.closingDay === null) return null
  const due = dueDateFor(card, key)
  const { year, monthIndex } = monthParts(key)
  const sameMonth = isoFromParts(year, monthIndex, card.closingDay)
  if (sameMonth < due) return sameMonth
  const previous = monthParts(addMonthsToKey(key, -1))
  return isoFromParts(previous.year, previous.monthIndex, card.closingDay)
}

/**
 * Best guess at whether the statement for `key` has closed, used to pre-set the
 * toggle when a balance is entered. With a closing day it is exact. Without one,
 * the next payment is assumed closed (statements usually close about three
 * weeks before they are due) and anything later is assumed still open.
 */
export function defaultStatusFor(
  card: Pick<CreditCard, 'dueDay' | 'closingDay'>,
  key: MonthKey,
  today: IsoDate,
): StatementStatus {
  const closing = closingDateFor(card, key)
  if (closing !== null) return today > closing ? 'closed' : 'open'
  return key <= nextDueMonth(card, today) ? 'closed' : 'open'
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000)
}

export function describeDueDay(card: Pick<CreditCard, 'dueDay'>): string {
  return `Due on the ${ordinal(card.dueDay)}`
}

// ── Payments ────────────────────────────────────────────────────────────────

export interface ResolvedPayment {
  monthKey: MonthKey
  dueDate: IsoDate
  amountMinor: number
  status: StatementStatus
  /** `entered` for this month's own number, `carried` when reusing an older one. */
  basis: 'entered' | 'carried'
  /** The month whose amount was reused, when `basis` is `carried`. */
  carriedFrom: MonthKey | null
  isEstimate: boolean
}

/** The month keys that have an entered amount, ascending. */
export function enteredMonths(card: Pick<CreditCard, 'statements'>): MonthKey[] {
  return Object.keys(card.statements).sort()
}

/**
 * What `card` is expected to cost in `key`, or `null` when nothing is known yet
 * (no entry for this month and none before it).
 */
export function resolvePayment(card: CreditCard, key: MonthKey): ResolvedPayment | null {
  const dueDate = dueDateFor(card, key)
  const own = card.statements[key]
  if (own) {
    return {
      monthKey: key,
      dueDate,
      amountMinor: own.amountMinor,
      status: own.status,
      basis: 'entered',
      carriedFrom: null,
      isEstimate: own.status === 'open',
    }
  }

  let latest: MonthKey | null = null
  for (const month of enteredMonths(card)) {
    if (month < key) latest = month
    else break
  }
  if (latest === null) return null

  const source = card.statements[latest] as CardStatement
  return {
    monthKey: key,
    dueDate,
    amountMinor: source.amountMinor,
    status: 'open',
    basis: 'carried',
    carriedFrom: latest,
    isEstimate: true,
  }
}

/**
 * True when the next statement has closed but its final balance isn't in yet —
 * either nothing was entered for that month, or only an open estimate was.
 * Before the statement closes there is no final number to enter, so a card is
 * not flagged just because the month is still empty.
 */
export function needsUpdate(card: CreditCard, today: IsoDate): boolean {
  const month = nextDueMonth(card, today)
  const entry = card.statements[month]
  if (entry && entry.status === 'closed') return false
  return defaultStatusFor(card, month, today) === 'closed'
}

/** Card payments landing in `[from, to]`, ascending. Zero amounts are skipped. */
export function cardOccurrencesInRange(card: CreditCard, from: IsoDate, to: IsoDate): Occurrence[] {
  if (from > to) return []
  const out: Occurrence[] = []
  const last = monthKeyOf(to)

  for (let key = monthKeyOf(from); key <= last; key = addMonthsToKey(key, 1)) {
    const due = dueDateFor(card, key)
    if (due < from || due > to) continue
    const payment = resolvePayment(card, key)
    if (payment === null || payment.amountMinor <= 0) continue
    out.push(toCardOccurrence(card, payment))
  }
  return out
}

export function toCardOccurrence(card: CreditCard, payment: ResolvedPayment): Occurrence {
  return {
    key: `card::${card.id}::${payment.dueDate}`,
    eventId: `card:${card.id}`,
    date: payment.dueDate,
    title: card.name,
    direction: 'expense',
    amountMinor: payment.amountMinor,
    signedMinor: -payment.amountMinor,
    categoryId: 'credit-card',
    isRecurring: true,
    cardId: card.id,
    isEstimate: payment.isEstimate,
  }
}

// ── Bank connection ─────────────────────────────────────────────────────────

/**
 * What a bank connection reports about one card, in this app's units. The
 * fields mirror Plaid's Liabilities product (credit), converted from dollars to
 * minor units and to ISO dates by the server before reaching the app.
 */
export interface CardLiabilitySnapshot {
  /** Everything owed right now, including charges since the last statement. */
  currentBalanceMinor: number
  lastStatementBalanceMinor: number | null
  lastStatementIssueDate: IsoDate | null
  nextPaymentDueDate: IsoDate | null
  lastPaymentAmountMinor: number | null
  lastPaymentDate: IsoDate | null
}

/**
 * Fold a bank snapshot into a card's monthly amounts.
 *
 * - The issued statement is final: its balance is owed on the next due date.
 * - Charges made since that statement land on the following due date as an
 *   open estimate that grows until the statement closes.
 * - A card that has never had a statement owes its current balance next.
 *
 * Charges since the statement are `current − statement + paid since`, because a
 * payment toward the statement lowers the current balance without touching the
 * new charges. Only the most recent payment is reported, so several payments in
 * one cycle are approximated by that one.
 *
 * A statement that was already paid early is still scheduled on its due date.
 * That is deliberate while the bank account itself is not linked: the starting
 * balance doesn't move when a payment clears, so the projection must deduct the
 * payment once, and the due date is where it does that.
 */
export function applyLiabilitySnapshot(
  card: CreditCard,
  snapshot: CardLiabilitySnapshot,
  timestamp: string,
  today: IsoDate,
): CreditCard {
  const statements: Record<MonthKey, CardStatement> = { ...card.statements }
  const linked = (amountMinor: number, status: StatementStatus): CardStatement => ({
    amountMinor: Math.max(0, Math.round(amountMinor)),
    status,
    source: 'linked',
    updatedAt: timestamp,
  })

  const {
    currentBalanceMinor,
    lastStatementBalanceMinor,
    lastStatementIssueDate,
    nextPaymentDueDate,
    lastPaymentAmountMinor,
    lastPaymentDate,
  } = snapshot

  const hasStatement =
    lastStatementBalanceMinor !== null &&
    lastStatementIssueDate !== null &&
    nextPaymentDueDate !== null &&
    nextPaymentDueDate > lastStatementIssueDate

  if (hasStatement) {
    const dueMonth = monthKeyOf(nextPaymentDueDate)
    statements[dueMonth] = linked(lastStatementBalanceMinor, 'closed')

    const paidSinceStatement =
      lastPaymentDate !== null && lastPaymentDate > lastStatementIssueDate
        ? (lastPaymentAmountMinor ?? 0)
        : 0
    const newCharges = currentBalanceMinor - lastStatementBalanceMinor + paidSinceStatement
    statements[addMonthsToKey(dueMonth, 1)] = linked(newCharges, 'open')
  } else {
    const dueMonth = nextPaymentDueDate ? monthKeyOf(nextPaymentDueDate) : nextDueMonth(card, today)
    statements[dueMonth] = linked(currentBalanceMinor, 'open')
  }

  return { ...card, statements, updatedAt: timestamp }
}

// ── Hand-entered payments ───────────────────────────────────────────────────

export interface HandEnteredPayment {
  event: BudgetEvent
  /** The event's next date on or after today. */
  nextDate: IsoDate
}

/** How far ahead to look for an event that will still hit the forecast. */
const LOOKAHEAD_DAYS = 400

/**
 * Upcoming expense events that look like card payments entered by hand before
 * cards existed. Once the card itself is set up, leaving these in would deduct
 * each payment twice.
 *
 * A match is the credit card category, or a title naming one of the user's
 * cards or its bank ("Chase Sapphire", "citi payment"). Only events that still
 * have a date ahead are returned — past ones are already behind the starting
 * balance and harmless.
 */
export function findHandEnteredCardPayments(
  events: BudgetEvent[],
  cards: CreditCard[],
  today: IsoDate,
): HandEnteredPayment[] {
  if (cards.length === 0) return []

  const needles = new Set<string>()
  for (const card of cards) {
    const name = card.name.trim().toLowerCase()
    if (name.length >= 3) needles.add(name)
    if (card.issuer !== 'other') needles.add(getIssuer(card.issuer).label.toLowerCase())
  }

  const horizon = addDays(today, LOOKAHEAD_DAYS)
  const out: HandEnteredPayment[] = []
  for (const event of events) {
    if (event.direction !== 'expense') continue
    const title = event.title.toLowerCase()
    const looksLikeCard =
      event.categoryId === 'credit-card' || [...needles].some((needle) => title.includes(needle))
    if (!looksLikeCard) continue

    const [nextDate] = occurrencesInRange(event, today, horizon)
    if (nextDate) out.push({ event, nextDate })
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate))
}
