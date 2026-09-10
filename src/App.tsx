import { useCallback, useEffect, useState } from 'react'
import { CalendarScreen } from './components/calendar/CalendarScreen'
import { DayDetail } from './components/day/DayDetail'
import { EventEditor } from './components/event/EventEditor'
import { SettingsSheet } from './components/settings/SettingsSheet'
import { useBudgetStore } from './data/store'
import { todayIso } from './domain/dates'
import type { BudgetEvent, IsoDate } from './domain/types'
import './App.css'

interface EditorState {
  open: boolean
  date: IsoDate
  event: BudgetEvent | null
}

export default function App() {
  const status = useBudgetStore((s) => s.status)
  const error = useBudgetStore((s) => s.error)
  const load = useBudgetStore((s) => s.load)

  const [detailDate, setDetailDate] = useState<IsoDate | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    date: todayIso(),
    event: null,
  })

  useEffect(() => {
    void load()
  }, [load])

  const handleSelectDay = useCallback((date: IsoDate) => setDetailDate(date), [])

  // Sheets are siblings rather than nested: close the day detail before raising the
  // editor so there is only ever one modal layer competing for focus and drag.
  const handleAddEvent = useCallback((date: IsoDate) => {
    setDetailDate(null)
    setEditor({ open: true, date, event: null })
  }, [])

  const handleEditEvent = useCallback((event: BudgetEvent) => {
    setDetailDate(null)
    setEditor({ open: true, date: event.startDate, event })
  }, [])

  const closeEditor = useCallback(() => {
    setEditor((prev) => ({ ...prev, open: false }))
  }, [])

  if (status === 'loading') {
    return (
      <div className="app-boot" role="status" aria-live="polite">
        <div className="app-boot__pulse" aria-hidden="true" />
        <span className="sr-only">Loading your budget</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-boot app-boot--error" role="alert">
        <p className="app-boot__title">Couldn’t open your budget</p>
        <p className="app-boot__detail">{error ?? 'Unknown error'}</p>
        <button className="app-boot__retry u-pressable" onClick={() => void load()}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <>
      <CalendarScreen
        onSelectDay={handleSelectDay}
        onAddEvent={handleAddEvent}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <DayDetail
        open={detailDate !== null}
        date={detailDate ?? todayIso()}
        onClose={() => setDetailDate(null)}
        onEditEvent={handleEditEvent}
        onAddEvent={handleAddEvent}
      />

      <EventEditor
        open={editor.open}
        date={editor.date}
        event={editor.event}
        onClose={closeEditor}
      />

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
