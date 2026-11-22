import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BudgetEvent, Settings } from '../domain/types'

const T = '2026-09-24T00:00:00.000Z'

const existingSettings: Settings = {
  startingBalanceMinor: 512_345,
  startingBalanceDate: '2026-09-24',
  currency: 'USD',
  locale: 'en-US',
  weekStartsOn: 0,
}

const existingEvent: BudgetEvent = {
  id: 'evt-real',
  title: 'Paycheck',
  direction: 'income',
  amountMinor: 250_000,
  categoryId: 'paycheck',
  startDate: '2026-10-01',
  recurrence: { frequency: 'biweekly', until: null, secondDayOfMonth: null },
  skippedDates: [],
  note: '',
  createdAt: T,
  updatedAt: T,
}

/** A fresh store and repository, with nothing cached from another test. */
async function loadStore() {
  vi.resetModules()
  const { useBudgetStore } = await import('./store')
  await useBudgetStore.getState().load()
  return useBudgetStore
}

async function seedVersion1(events: BudgetEvent[], settings: Settings | null): Promise<void> {
  const db = await openDB('ledger', 1, {
    upgrade(database) {
      database.createObjectStore('events', { keyPath: 'id' }).createIndex('startDate', 'startDate')
      database.createObjectStore('settings')
    },
  })
  for (const event of events) await db.put('events', event)
  if (settings) await db.put('settings', settings, 'app')
  db.close()
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('loading an existing user’s data after the upgrade', () => {
  it('keeps their events and settings and never re-seeds the demo', async () => {
    await seedVersion1([existingEvent], existingSettings)
    const store = await loadStore()
    const state = store.getState()

    expect(state.status).toBe('ready')
    expect(state.events).toEqual([existingEvent])
    expect(state.settings).toEqual(existingSettings)
    expect(state.cards).toEqual([])
  })

  it('does not re-seed a user who deleted every event', async () => {
    await seedVersion1([], existingSettings)
    const store = await loadStore()
    expect(store.getState().events).toEqual([])
  })
})

describe('card actions', () => {
  it('creates a card, persists it, and fills in a blank name from the issuer', async () => {
    const store = await loadStore()
    const id = await store.getState().saveCard({
      name: '  ',
      issuer: 'citi',
      last4: 'ab12-34',
      dueDay: 9,
      closingDay: null,
    })

    expect(id).not.toBeNull()
    const [card] = store.getState().cards
    expect(card).toMatchObject({ id, name: 'Citi card', last4: '1234', dueDay: 9, statements: {} })

    const reloaded = await loadStore()
    expect(reloaded.getState().cards.map((c) => c.id)).toEqual([id])
  })

  it('rejects a card without a valid due day', async () => {
    const store = await loadStore()
    const id = await store.getState().saveCard({ name: 'X', issuer: 'chase', last4: '', dueDay: 0, closingDay: null })
    expect(id).toBeNull()
    expect(store.getState().cards).toEqual([])
    expect(store.getState().error).toMatch(/due/i)
  })

  it('editing details keeps the balances already entered', async () => {
    const store = await loadStore()
    const id = (await store.getState().saveCard({ name: 'Sapphire', issuer: 'chase', last4: '', dueDay: 15, closingDay: 18 })) as string
    await store.getState().setCardStatement(id, '2026-12', 84_210, 'closed')
    await store.getState().saveCard({ id, name: 'Sapphire Reserve', issuer: 'chase', last4: '9876', dueDay: 16, closingDay: 19 })

    const [card] = store.getState().cards
    expect(card?.name).toBe('Sapphire Reserve')
    expect(card?.dueDay).toBe(16)
    expect(card?.statements['2026-12']?.amountMinor).toBe(84_210)
  })

  it('sets, overwrites and clears one month without touching the others', async () => {
    const store = await loadStore()
    const id = (await store.getState().saveCard({ name: 'Sapphire', issuer: 'chase', last4: '', dueDay: 15, closingDay: null })) as string

    await store.getState().setCardStatement(id, '2026-12', 84_210, 'closed')
    await store.getState().setCardStatement(id, '2027-01', 12_000, 'open')
    await store.getState().setCardStatement(id, '2027-01', 15_500, 'open')
    await store.getState().clearCardStatement(id, '2026-12')

    const reloaded = await loadStore()
    const statements = reloaded.getState().cards[0]?.statements ?? {}
    expect(Object.keys(statements)).toEqual(['2027-01'])
    expect(statements['2027-01']).toMatchObject({ amountMinor: 15_500, status: 'open', source: 'manual' })
  })

  it('refuses a malformed month key', async () => {
    const store = await loadStore()
    const id = (await store.getState().saveCard({ name: 'S', issuer: 'chase', last4: '', dueDay: 15, closingDay: null })) as string
    await store.getState().setCardStatement(id, '2026-13', 100, 'closed')
    expect(store.getState().cards[0]?.statements).toEqual({})
  })

  it('deletes a card and reset clears every card', async () => {
    const store = await loadStore()
    const a = (await store.getState().saveCard({ name: 'A', issuer: 'chase', last4: '', dueDay: 1, closingDay: null })) as string
    await store.getState().saveCard({ name: 'B', issuer: 'citi', last4: '', dueDay: 2, closingDay: null })

    await store.getState().deleteCard(a)
    expect(store.getState().cards.map((c) => c.name)).toEqual(['B'])

    await store.getState().resetAll()
    expect(store.getState().cards).toEqual([])
    expect((await loadStore()).getState().cards).toEqual([])
  })
})
