import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BudgetEvent, CreditCard, Settings } from '../domain/types'

const T = '2026-09-24T00:00:00.000Z'

const userEvent: BudgetEvent = {
  id: 'evt-real',
  title: 'Chase Sapphire',
  direction: 'expense',
  amountMinor: 84_210,
  categoryId: 'credit-card',
  startDate: '2026-12-15',
  recurrence: { frequency: 'once', until: null, secondDayOfMonth: null },
  skippedDates: [],
  note: '',
  createdAt: T,
  updatedAt: T,
}

const userSettings: Settings = {
  startingBalanceMinor: 512_345,
  startingBalanceDate: '2026-09-24',
  currency: 'USD',
  locale: 'en-US',
  weekStartsOn: 0,
}

const card: CreditCard = {
  id: 'card-1',
  name: 'Chase Sapphire',
  issuer: 'chase',
  last4: '1234',
  dueDay: 15,
  closingDay: 18,
  statements: { '2026-12': { amountMinor: 84_210, status: 'closed', source: 'manual', updatedAt: T } },
  linkedAccountId: null,
  createdAt: T,
  updatedAt: T,
}

/** Recreates the database exactly as the v1 app (before cards) left it. */
async function seedVersion1Database(): Promise<void> {
  const db = await openDB('ledger', 1, {
    upgrade(database) {
      const events = database.createObjectStore('events', { keyPath: 'id' })
      events.createIndex('startDate', 'startDate')
      database.createObjectStore('settings')
    },
  })
  await db.put('events', userEvent)
  await db.put('settings', userSettings, 'app')
  db.close()
}

/** A fresh module instance, so its cached connection doesn't leak across tests. */
async function loadRepository() {
  vi.resetModules()
  const module = await import('./indexeddb')
  return module.repository
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('upgrading an existing v1 database', () => {
  it('keeps every event and the settings, and adds an empty cards store', async () => {
    await seedVersion1Database()
    const repository = await loadRepository()

    expect(await repository.listEvents()).toEqual([userEvent])
    expect(await repository.getSettings()).toEqual(userSettings)
    expect(await repository.listCards()).toEqual([])

    const db = await openDB('ledger')
    expect(db.version).toBe(2)
    expect([...db.objectStoreNames].sort()).toEqual(['cards', 'events', 'settings'])
    db.close()
  })

  it('keeps the start-date index that event listing depends on', async () => {
    await seedVersion1Database()
    const repository = await loadRepository()
    await repository.putEvent({ ...userEvent, id: 'evt-earlier', startDate: '2026-10-01' })
    expect((await repository.listEvents()).map((e) => e.id)).toEqual(['evt-earlier', 'evt-real'])
  })

  it('stores cards alongside the old data after the upgrade', async () => {
    await seedVersion1Database()
    const repository = await loadRepository()
    await repository.putCard(card)

    expect(await repository.listCards()).toEqual([card])
    expect(await repository.listEvents()).toEqual([userEvent])
  })
})

describe('cards on a fresh install', () => {
  it('round-trips, updates in place, and deletes', async () => {
    const repository = await loadRepository()
    await repository.putCard(card)
    await repository.putCard({ ...card, name: 'Sapphire Reserve' })
    expect((await repository.listCards()).map((c) => c.name)).toEqual(['Sapphire Reserve'])

    await repository.deleteCard(card.id)
    expect(await repository.listCards()).toEqual([])
  })

  it('reset clears cards along with events and settings', async () => {
    const repository = await loadRepository()
    await repository.putCard(card)
    await repository.putEvent(userEvent)
    await repository.putSettings(userSettings)

    await repository.clear()
    expect(await repository.listCards()).toEqual([])
    expect(await repository.listEvents()).toEqual([])
    expect(await repository.getSettings()).toBeNull()
  })
})
