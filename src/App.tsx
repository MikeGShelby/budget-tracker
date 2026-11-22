import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarScreen } from './components/calendar/CalendarScreen'
import { CardEditor } from './components/cards/CardEditor'
import { CardSheet } from './components/cards/CardSheet'
import { CardsScreen } from './components/cards/CardsScreen'
import { DayDetail } from './components/day/DayDetail'
import { EventEditor } from './components/event/EventEditor'
import { TabBar } from './components/nav/TabBar'
import type { TabId } from './components/nav/TabBar'
import { SettingsSheet } from './components/settings/SettingsSheet'
import { useBudgetStore } from './data/store'
import { monthKeyOf, needsUpdate } from './domain/cards'
import { todayIso } from './domain/dates'
import type { BudgetEvent, IsoDate, MonthKey } from './domain/types'
import './App.css'

interface EditorState {
  open: boolean
  date: IsoDate
  event: BudgetEvent | null
}

interface CardSheetState {
  open: boolean
  cardId: string | null
  month: MonthKey
}

interface CardEditorState {
  open: boolean
  /** `null` adds a new card. */
  cardId: string | null
}

export default function App() {
  const status = useBudgetStore((s) => s.status)
  const error = useBudgetStore((s) => s.error)
  const load = useBudgetStore((s) => s.load)
  const cards = useBudgetStore((s) => s.cards)

  const [tab, setTab] = useState<TabId>('calendar')
  const [detailDate, setDetailDate] = useState<IsoDate | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    date: todayIso(),
    event: null,
  })
  const [cardSheet, setCardSheet] = useState<CardSheetState>({
    open: false,
    cardId: null,
    month: monthKeyOf(todayIso()),
  })
  const [cardEditor, setCardEditor] = useState<CardEditorState>({ open: false, cardId: null })

  useEffect(() => {
    void load()
  }, [load])

  const cardsBadge = useMemo(() => {
    const today = todayIso()
    return cards.filter((card) => needsUpdate(card, today)).length
  }, [cards])

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

  const openCard = useCallback((cardId: string, month: MonthKey) => {
    setDetailDate(null)
    setCardSheet({ open: true, cardId, month })
  }, [])

  const editCard = useCallback((cardId: string) => {
    setCardSheet((prev) => ({ ...prev, open: false }))
    setCardEditor({ open: true, cardId })
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
    <div className="shell">
      {/* Both screens stay mounted so switching tabs keeps the month you were
          looking at and the scroll position of the card list. */}
      <main className="shell__screen">
        <div className="shell__view" hidden={tab !== 'calendar'}>
          <CalendarScreen
            onSelectDay={handleSelectDay}
            onAddEvent={handleAddEvent}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
        <div className="shell__view" hidden={tab !== 'cards'}>
          <CardsScreen
            onOpenCard={openCard}
            onAddCard={() => setCardEditor({ open: true, cardId: null })}
          />
        </div>
      </main>

      <TabBar active={tab} onChange={setTab} cardsBadge={cardsBadge} />

      <DayDetail
        open={detailDate !== null}
        date={detailDate ?? todayIso()}
        onClose={() => setDetailDate(null)}
        onEditEvent={handleEditEvent}
        onAddEvent={handleAddEvent}
        onOpenCard={openCard}
      />

      <EventEditor
        open={editor.open}
        date={editor.date}
        event={editor.event}
        onClose={closeEditor}
      />

      <CardSheet
        open={cardSheet.open}
        cardId={cardSheet.cardId}
        month={cardSheet.month}
        onClose={() => setCardSheet((prev) => ({ ...prev, open: false }))}
        onEditCard={editCard}
      />

      <CardEditor
        open={cardEditor.open}
        cardId={cardEditor.cardId}
        onClose={() => setCardEditor((prev) => ({ ...prev, open: false }))}
      />

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
