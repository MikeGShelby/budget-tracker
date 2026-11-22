/**
 * The app's single source of truth for events and settings.
 *
 * Writes are optimistic — the UI updates the instant you tap Save, then the
 * repository write settles behind it. If that write fails the previous state is
 * put back and `error` is set, so the calendar can never drift out of sync with
 * what is actually on disk.
 *
 * Actions never throw. A sheet that does `await saveEvent(draft); close()` is
 * the shape every consumer wants to write, and an unhandled rejection there
 * would take the view down. Failures land in `error` instead.
 */
import { create } from 'zustand'
import { ISSUERS, getIssuer } from '../domain/cards'
import { defaultCategoryFor, getCategory } from '../domain/categories'
import { isValidIso, todayIso } from '../domain/dates'
import type {
  BudgetEvent,
  CardIssuer,
  CategoryId,
  CreditCard,
  EventDirection,
  IsoDate,
  MonthKey,
  Recurrence,
  RecurrenceFrequency,
  Settings,
  StatementStatus,
} from '../domain/types'
import { repository } from './indexeddb'
import { DEFAULT_SETTINGS } from './repository'
import { buildSeedEvents, buildSeedSettings } from './seed'

export type EventDraft = Omit<BudgetEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

/** The editable details of a card; balances are set separately per month. */
export interface CardDraft {
  id?: string
  name: string
  issuer: CardIssuer
  last4: string
  dueDay: number
  closingDay: number | null
}

export interface BudgetState {
  events: BudgetEvent[]
  cards: CreditCard[]
  settings: Settings
  status: 'loading' | 'ready' | 'error'
  error: string | null
  load(): Promise<void>
  saveEvent(draft: EventDraft): Promise<void>
  deleteEvent(id: string): Promise<void>
  skipOccurrence(eventId: string, date: IsoDate): Promise<void>
  /** Creates or updates a card's details. Resolves to its id, or `null` if invalid. */
  saveCard(draft: CardDraft): Promise<string | null>
  deleteCard(id: string): Promise<void>
  /** Sets what a card owes in one due month. */
  setCardStatement(
    cardId: string,
    month: MonthKey,
    amountMinor: number,
    status: StatementStatus,
  ): Promise<void>
  /** Removes one month's amount, so that month falls back to the last known one. */
  clearCardStatement(cardId: string, month: MonthKey): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  resetAll(): Promise<void>
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const FREQUENCIES: readonly RecurrenceFrequency[] = [
  'once',
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'yearly',
]

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  if (typeof error === 'string' && error !== '') return error
  return 'Something went wrong saving your changes.'
}

/** Ascending by start date; ties broken deterministically so renders are stable. */
function sortEvents(events: BudgetEvent[]): BudgetEvent[] {
  return [...events].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  )
}

function upsert(events: BudgetEvent[], event: BudgetEvent): BudgetEvent[] {
  const without = events.filter((candidate) => candidate.id !== event.id)
  without.push(event)
  return sortEvents(without)
}

function uniqueSortedDates(dates: readonly IsoDate[]): IsoDate[] {
  return [...new Set(dates.filter((date) => isValidIso(date)))].sort((a, b) => a.localeCompare(b))
}

function normalizeCategory(id: CategoryId, direction: EventDirection): CategoryId {
  // `getCategory` falls back rather than throwing, so an id that survives a
  // round trip unchanged is the test for "this is a real category".
  const resolved = getCategory(id)
  if (resolved.id !== id) return defaultCategoryFor(direction)
  // A category can also be on the wrong side of the ledger if a draft flipped
  // direction after the picker ran.
  if (resolved.direction !== direction) return defaultCategoryFor(direction)
  return resolved.id
}

function normalizeRecurrence(recurrence: Recurrence | undefined, startDate: IsoDate): Recurrence {
  const frequency =
    recurrence && FREQUENCIES.includes(recurrence.frequency) ? recurrence.frequency : 'once'

  const rawUntil = recurrence?.until ?? null
  // An end date before the first occurrence would produce an empty series.
  const until = rawUntil !== null && isValidIso(rawUntil) && rawUntil >= startDate ? rawUntil : null

  const rawSecond = recurrence?.secondDayOfMonth ?? null
  const secondDayOfMonth =
    frequency === 'semimonthly' &&
    rawSecond !== null &&
    Number.isInteger(rawSecond) &&
    rawSecond >= 1 &&
    rawSecond <= 31
      ? rawSecond
      : null

  return { frequency, until, secondDayOfMonth }
}

function normalizeSettings(settings: Settings): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...settings }
  const startingBalanceMinor = Number.isFinite(merged.startingBalanceMinor)
    ? Math.round(merged.startingBalanceMinor)
    : 0

  return {
    startingBalanceMinor,
    startingBalanceDate: isValidIso(merged.startingBalanceDate)
      ? merged.startingBalanceDate
      : todayIso(),
    currency: merged.currency || DEFAULT_SETTINGS.currency,
    locale: merged.locale || DEFAULT_SETTINGS.locale,
    weekStartsOn: merged.weekStartsOn === 1 ? 1 : 0,
  }
}

class ValidationError extends Error {}

/**
 * Turn a draft into a storable event, or explain why it can't be stored.
 * A blank title is recoverable (use the category name); a missing amount or a
 * nonsense date is not.
 */
function normalizeDraft(
  draft: EventDraft,
  existing: BudgetEvent | undefined,
  timestamp: string,
): BudgetEvent {
  const startDate = draft.startDate
  if (typeof startDate !== 'string' || !isValidIso(startDate)) {
    throw new ValidationError('Pick a valid date for this event.')
  }

  const direction: EventDirection = draft.direction === 'income' ? 'income' : 'expense'
  const categoryId = normalizeCategory(draft.categoryId, direction)

  const amountMinor = Math.round(Math.abs(Number(draft.amountMinor)))
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new ValidationError('Enter an amount greater than zero.')
  }

  const trimmed = (draft.title ?? '').trim()
  const title = trimmed === '' ? getCategory(categoryId).label : trimmed

  return {
    id: draft.id ?? existing?.id ?? crypto.randomUUID(),
    title,
    direction,
    amountMinor,
    categoryId,
    startDate,
    recurrence: normalizeRecurrence(draft.recurrence, startDate),
    skippedDates: uniqueSortedDates(draft.skippedDates ?? []),
    note: (draft.note ?? '').trim(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

const ISSUER_IDS = new Set<CardIssuer>(ISSUERS.map((issuer) => issuer.id))
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/

function isDayOfMonth(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31
}

/** Oldest first, so the list order doesn't shuffle as cards are edited. */
function sortCards(cards: CreditCard[]): CreditCard[] {
  return [...cards].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

function upsertCard(cards: CreditCard[], card: CreditCard): CreditCard[] {
  return sortCards([...cards.filter((candidate) => candidate.id !== card.id), card])
}

function normalizeCardDraft(
  draft: CardDraft,
  existing: CreditCard | undefined,
  timestamp: string,
): CreditCard {
  if (!isDayOfMonth(draft.dueDay)) throw new ValidationError('Pick the day of the month this card is due.')
  const closingDay = isDayOfMonth(draft.closingDay) ? draft.closingDay : null
  const issuer = ISSUER_IDS.has(draft.issuer) ? draft.issuer : 'other'

  const trimmed = (draft.name ?? '').trim()
  const name = trimmed === '' ? `${getIssuer(issuer).label} card` : trimmed

  return {
    id: draft.id ?? existing?.id ?? crypto.randomUUID(),
    name,
    issuer,
    last4: (draft.last4 ?? '').replace(/\D/g, '').slice(-4),
    dueDay: draft.dueDay,
    closingDay,
    statements: existing?.statements ?? {},
    linkedAccountId: existing?.linkedAccountId ?? null,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

/**
 * StrictMode mounts effects twice in development, and two concurrent `load`s
 * both seeing an empty database would seed twice. Sharing one in-flight promise
 * makes the second call a no-op that simply waits.
 */
let inFlightLoad: Promise<void> | null = null

// ── Store ───────────────────────────────────────────────────────────────────

export const useBudgetStore = create<BudgetState>()((set, get) => ({
  events: [],
  cards: [],
  settings: DEFAULT_SETTINGS,
  status: 'loading',
  error: null,

  async load(): Promise<void> {
    if (inFlightLoad !== null) return inFlightLoad

    const run = (async () => {
      set({ status: 'loading', error: null })
      try {
        const [storedSettings, storedEvents, storedCards] = await Promise.all([
          repository.getSettings(),
          repository.listEvents(),
          repository.listCards(),
        ])
        const cards = sortCards(storedCards)
        const today = todayIso()

        // First run only: no settings record has ever been written *and* there
        // are no events. Once settings exist — including after a reset or after
        // the user deletes every event — the demo data never comes back.
        if (storedSettings === null && storedEvents.length === 0 && cards.length === 0) {
          const settings = buildSeedSettings(today)
          const events = buildSeedEvents(today)
          await repository.putEvents(events)
          await repository.putSettings(settings)
          set({ settings, events: sortEvents(events), cards: [], status: 'ready', error: null })
          return
        }

        let settings: Settings
        if (storedSettings === null) {
          settings = { ...DEFAULT_SETTINGS, startingBalanceDate: today }
          await repository.putSettings(settings)
        } else {
          settings = normalizeSettings(storedSettings)
        }

        set({ settings, events: sortEvents(storedEvents), cards, status: 'ready', error: null })
      } catch (error) {
        set({ status: 'error', error: messageOf(error) })
      }
    })()

    inFlightLoad = run
    try {
      await run
    } finally {
      inFlightLoad = null
    }
  },

  async saveEvent(draft: EventDraft): Promise<void> {
    const previous = get().events
    const existing = draft.id ? previous.find((event) => event.id === draft.id) : undefined

    let event: BudgetEvent
    try {
      event = normalizeDraft(draft, existing, new Date().toISOString())
    } catch (error) {
      set({ error: messageOf(error) })
      return
    }

    set({ events: upsert(previous, event), error: null })
    try {
      await repository.putEvent(event)
    } catch (error) {
      set({ events: previous, error: messageOf(error) })
    }
  },

  async deleteEvent(id: string): Promise<void> {
    const previous = get().events
    const next = previous.filter((event) => event.id !== id)
    if (next.length === previous.length) return

    set({ events: next, error: null })
    try {
      await repository.deleteEvent(id)
    } catch (error) {
      set({ events: previous, error: messageOf(error) })
    }
  },

  async skipOccurrence(eventId: string, date: IsoDate): Promise<void> {
    const previous = get().events
    const target = previous.find((event) => event.id === eventId)
    if (!target) return

    if (!isValidIso(date)) {
      set({ error: 'That occurrence has an invalid date.' })
      return
    }

    // A one-off has exactly one occurrence, so skipping it is deleting it —
    // otherwise the series would linger as an invisible, unreachable record.
    if (target.recurrence.frequency === 'once') {
      await get().deleteEvent(eventId)
      return
    }

    if (target.skippedDates.includes(date)) return

    const updated: BudgetEvent = {
      ...target,
      skippedDates: uniqueSortedDates([...target.skippedDates, date]),
      updatedAt: new Date().toISOString(),
    }

    set({ events: upsert(previous, updated), error: null })
    try {
      await repository.putEvent(updated)
    } catch (error) {
      set({ events: previous, error: messageOf(error) })
    }
  },

  async saveCard(draft: CardDraft): Promise<string | null> {
    const previous = get().cards
    const existing = draft.id ? previous.find((card) => card.id === draft.id) : undefined

    let card: CreditCard
    try {
      card = normalizeCardDraft(draft, existing, new Date().toISOString())
    } catch (error) {
      set({ error: messageOf(error) })
      return null
    }

    set({ cards: upsertCard(previous, card), error: null })
    try {
      await repository.putCard(card)
      return card.id
    } catch (error) {
      set({ cards: previous, error: messageOf(error) })
      return null
    }
  },

  async deleteCard(id: string): Promise<void> {
    const previous = get().cards
    const next = previous.filter((card) => card.id !== id)
    if (next.length === previous.length) return

    set({ cards: next, error: null })
    try {
      await repository.deleteCard(id)
    } catch (error) {
      set({ cards: previous, error: messageOf(error) })
    }
  },

  async setCardStatement(
    cardId: string,
    month: MonthKey,
    amountMinor: number,
    status: StatementStatus,
  ): Promise<void> {
    const previous = get().cards
    const target = previous.find((card) => card.id === cardId)
    if (!target) return

    const amount = Math.round(Math.abs(Number(amountMinor)))
    if (!MONTH_KEY.test(month) || !Number.isSafeInteger(amount)) {
      set({ error: 'That balance could not be saved.' })
      return
    }

    const timestamp = new Date().toISOString()
    const updated: CreditCard = {
      ...target,
      statements: {
        ...target.statements,
        [month]: {
          amountMinor: amount,
          status: status === 'open' ? 'open' : 'closed',
          source: 'manual',
          updatedAt: timestamp,
        },
      },
      updatedAt: timestamp,
    }

    set({ cards: upsertCard(previous, updated), error: null })
    try {
      await repository.putCard(updated)
    } catch (error) {
      set({ cards: previous, error: messageOf(error) })
    }
  },

  async clearCardStatement(cardId: string, month: MonthKey): Promise<void> {
    const previous = get().cards
    const target = previous.find((card) => card.id === cardId)
    if (!target || !(month in target.statements)) return

    const statements = { ...target.statements }
    delete statements[month]
    const updated: CreditCard = { ...target, statements, updatedAt: new Date().toISOString() }

    set({ cards: upsertCard(previous, updated), error: null })
    try {
      await repository.putCard(updated)
    } catch (error) {
      set({ cards: previous, error: messageOf(error) })
    }
  },

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const previous = get().settings
    const next = normalizeSettings({ ...previous, ...patch })

    set({ settings: next, error: null })
    try {
      await repository.putSettings(next)
    } catch (error) {
      set({ settings: previous, error: messageOf(error) })
    }
  },

  async resetAll(): Promise<void> {
    const today = todayIso()
    const settings: Settings = { ...DEFAULT_SETTINGS, startingBalanceDate: today }
    try {
      await repository.clear()
      // Writing settings straight back leaves the "already initialised" marker
      // in place, so a reset lands on an empty calendar rather than the demo.
      await repository.putSettings(settings)
      set({ events: [], cards: [], settings, status: 'ready', error: null })
    } catch (error) {
      set({ error: messageOf(error) })
    }
  },
}))
