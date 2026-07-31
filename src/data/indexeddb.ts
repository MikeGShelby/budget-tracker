/**
 * IndexedDB implementation of `BudgetRepository`.
 *
 * Local-first means the database is the source of truth, so the one thing this
 * module must never do is take the app down with it. Private browsing, a
 * storage-blocked WKWebView, an origin with IndexedDB disabled by policy, or a
 * user who denied persistence all surface as "the open never succeeds" — in
 * every one of those cases we log once and hand back a working in-memory
 * repository instead. The session is ephemeral, but the app runs.
 *
 * Once the database *has* opened, per-operation failures deliberately reject:
 * the store rolls those back and surfaces an error rather than silently writing
 * to memory and pretending the data is safe on disk.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { BudgetEvent, Settings } from '../domain/types'
import type { BudgetRepository } from './repository'

const DB_NAME = 'ledger'
const DB_VERSION = 1
const EVENTS_STORE = 'events'
const SETTINGS_STORE = 'settings'
const SETTINGS_KEY = 'app'
const START_DATE_INDEX = 'startDate'

/**
 * Safari in private mode can leave an `open` request pending forever rather
 * than firing `error`. Without a ceiling the app would sit on its loading
 * skeleton indefinitely, so give up and degrade to memory.
 */
const OPEN_TIMEOUT_MS = 4_000

interface LedgerSchema extends DBSchema {
  events: {
    key: string
    value: BudgetEvent
    indexes: { startDate: string }
  }
  settings: {
    key: string
    value: Settings
  }
}

// ── In-memory fallback ──────────────────────────────────────────────────────

const memoryEvents = new Map<string, BudgetEvent>()
let memorySettings: Settings | null = null

/**
 * IndexedDB structured-clones on the way in and out, so callers can never
 * mutate stored records by reference. The fallback matches that, otherwise a
 * component holding an event object could quietly rewrite "persisted" state.
 */
function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)
}

function byStartDate(a: BudgetEvent, b: BudgetEvent): number {
  return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0
}

const memoryRepository: BudgetRepository = {
  async listEvents() {
    return [...memoryEvents.values()].map(clone).sort(byStartDate)
  },
  async putEvent(event) {
    memoryEvents.set(event.id, clone(event))
  },
  async putEvents(events) {
    for (const event of events) memoryEvents.set(event.id, clone(event))
  },
  async deleteEvent(id) {
    memoryEvents.delete(id)
  },
  async getSettings() {
    return memorySettings === null ? null : clone(memorySettings)
  },
  async putSettings(settings) {
    memorySettings = clone(settings)
  },
  async clear() {
    memoryEvents.clear()
    memorySettings = null
  },
}

// ── Connection ──────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<LedgerSchema> | null> | null = null
let warned = false

function warnOnce(reason: unknown): void {
  if (warned) return
  warned = true
  console.warn(
    '[ledger] IndexedDB is unavailable — running with in-memory storage for this session. Changes will not persist.',
    reason,
  )
}

async function openLedgerDb(): Promise<IDBPDatabase<LedgerSchema> | null> {
  if (typeof indexedDB === 'undefined') {
    warnOnce(new Error('indexedDB is not available in this environment'))
    return null
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), OPEN_TIMEOUT_MS)
  })

  try {
    const opened = await Promise.race([
      openDB<LedgerSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(EVENTS_STORE)) {
            const events = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' })
            events.createIndex(START_DATE_INDEX, 'startDate')
          }
          if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
            // Out-of-line key: exactly one record, under SETTINGS_KEY.
            db.createObjectStore(SETTINGS_STORE)
          }
        },
        blocked() {
          // Another tab is holding an older version open. It will resolve once
          // that tab closes; the timeout above covers the case where it doesn't.
        },
        terminated() {
          // The browser killed the connection (eviction, crash). Drop the cache
          // so the next call reopens rather than reusing a dead handle.
          dbPromise = null
        },
      }),
      timeout,
    ])

    if (opened === null) {
      warnOnce(new Error(`opening "${DB_NAME}" timed out after ${OPEN_TIMEOUT_MS}ms`))
      return null
    }
    return opened
  } catch (error) {
    warnOnce(error)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function getDb(): Promise<IDBPDatabase<LedgerSchema> | null> {
  dbPromise ??= openLedgerDb()
  return dbPromise
}

// ── Public repository ───────────────────────────────────────────────────────

export const repository: BudgetRepository = {
  async listEvents(): Promise<BudgetEvent[]> {
    const db = await getDb()
    if (db === null) return memoryRepository.listEvents()
    // Reading through the index returns rows already ordered by start date.
    return db.getAllFromIndex(EVENTS_STORE, START_DATE_INDEX)
  },

  async putEvent(event: BudgetEvent): Promise<void> {
    const db = await getDb()
    if (db === null) return memoryRepository.putEvent(event)
    await db.put(EVENTS_STORE, event)
  },

  async putEvents(events: BudgetEvent[]): Promise<void> {
    if (events.length === 0) return
    const db = await getDb()
    if (db === null) return memoryRepository.putEvents(events)

    // One transaction so a partial seed can never land.
    const tx = db.transaction(EVENTS_STORE, 'readwrite')
    await Promise.all([...events.map((event) => tx.store.put(event)), tx.done])
  },

  async deleteEvent(id: string): Promise<void> {
    const db = await getDb()
    if (db === null) return memoryRepository.deleteEvent(id)
    await db.delete(EVENTS_STORE, id)
  },

  async getSettings(): Promise<Settings | null> {
    const db = await getDb()
    if (db === null) return memoryRepository.getSettings()
    const stored = await db.get(SETTINGS_STORE, SETTINGS_KEY)
    return stored ?? null
  },

  async putSettings(settings: Settings): Promise<void> {
    const db = await getDb()
    if (db === null) return memoryRepository.putSettings(settings)
    await db.put(SETTINGS_STORE, settings, SETTINGS_KEY)
  },

  async clear(): Promise<void> {
    // Always wipe the mirror too: a session can degrade to memory partway
    // through, and "reset app" must not leave anything behind either side.
    await memoryRepository.clear()
    const db = await getDb()
    if (db === null) return

    const tx = db.transaction([EVENTS_STORE, SETTINGS_STORE], 'readwrite')
    await Promise.all([
      tx.objectStore(EVENTS_STORE).clear(),
      tx.objectStore(SETTINGS_STORE).clear(),
      tx.done,
    ])
  },
}
