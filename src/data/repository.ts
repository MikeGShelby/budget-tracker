import type { BudgetEvent, Settings } from '../domain/types'

/**
 * Persistence boundary.
 *
 * The app talks only to this interface, so swapping the on-device IndexedDB
 * implementation for a synced HTTP-backed one later is an adapter change rather
 * than a rewrite of the UI.
 */
export interface BudgetRepository {
  listEvents(): Promise<BudgetEvent[]>
  putEvent(event: BudgetEvent): Promise<void>
  putEvents(events: BudgetEvent[]): Promise<void>
  deleteEvent(id: string): Promise<void>

  getSettings(): Promise<Settings | null>
  putSettings(settings: Settings): Promise<void>

  /** Wipe all local data. Used by "reset app" in settings. */
  clear(): Promise<void>
}

export const DEFAULT_SETTINGS: Settings = {
  startingBalanceMinor: 0,
  startingBalanceDate: '1970-01-01', // replaced with today on first run
  currency: 'USD',
  locale: 'en-US',
  weekStartsOn: 0,
}
