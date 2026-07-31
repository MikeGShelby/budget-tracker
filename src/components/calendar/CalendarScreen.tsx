import { useCallback, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { motion } from 'motion/react'
import { useBudgetStore } from '../../data/store'
import {
  addMonthsClamped,
  endOfMonth,
  isSameMonth,
  startOfMonth,
  todayIso,
} from '../../domain/dates'
import { projectRange } from '../../domain/projection'
import type { IsoDate } from '../../domain/types'
import { Icon } from '../ui/Icon'
import { BalanceHero } from './BalanceHero'
import { MonthGrid } from './MonthGrid'
import { MonthHeader } from './MonthHeader'
import './CalendarScreen.css'

export interface CalendarScreenProps {
  onSelectDay: (date: IsoDate) => void
  onAddEvent: (date: IsoDate) => void
  onOpenSettings: () => void
}

export function CalendarScreen({
  onSelectDay,
  onAddEvent,
  onOpenSettings,
}: CalendarScreenProps): ReactElement {
  const events = useBudgetStore((s) => s.events)
  const settings = useBudgetStore((s) => s.settings)

  const today = todayIso()
  const [monthAnchor, setMonthAnchor] = useState<IsoDate>(() => startOfMonth(today))
  const [selectedDate, setSelectedDate] = useState<IsoDate>(today)
  const [direction, setDirection] = useState(0)

  // Month totals for the hero, plus the balance on whichever day is selected.
  const monthSummary = useMemo(
    () => projectRange(events, settings, startOfMonth(monthAnchor), endOfMonth(monthAnchor)),
    [events, settings, monthAnchor],
  )

  const heroBalance = useMemo(
    () => projectRange(events, settings, selectedDate, selectedDate).closingBalanceMinor,
    [events, settings, selectedDate],
  )

  const shiftMonth = useCallback((delta: number) => {
    setDirection(delta)
    setMonthAnchor((prev) => startOfMonth(addMonthsClamped(prev, delta, 1)))
  }, [])

  const goToday = useCallback(() => {
    setDirection(startOfMonth(today) > monthAnchor ? 1 : -1)
    setMonthAnchor(startOfMonth(today))
    setSelectedDate(today)
  }, [today, monthAnchor])

  const handleSelectDay = useCallback(
    (date: IsoDate) => {
      setSelectedDate(date)
      // Tapping a trailing/leading day should follow the user into that month.
      if (!isSameMonth(date, monthAnchor)) {
        setDirection(date > monthAnchor ? 1 : -1)
        setMonthAnchor(startOfMonth(date))
      }
      onSelectDay(date)
    },
    [monthAnchor, onSelectDay],
  )

  return (
    <div className="calendar">
      <MonthHeader
        monthAnchor={monthAnchor}
        locale={settings.locale}
        isCurrentMonth={isSameMonth(monthAnchor, today)}
        direction={direction}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
        onToday={goToday}
        onOpenSettings={onOpenSettings}
      />

      <BalanceHero
        balanceMinor={heroBalance}
        date={selectedDate}
        monthIncomeMinor={monthSummary.totalIncomeMinor}
        monthExpenseMinor={monthSummary.totalExpenseMinor}
        locale={settings.locale}
        currency={settings.currency}
      />

      <MonthGrid
        monthAnchor={monthAnchor}
        selectedDate={selectedDate}
        events={events}
        settings={settings}
        direction={direction}
        onSelectDay={handleSelectDay}
        onSwipeMonth={shiftMonth}
      />

      <motion.button
        type="button"
        className="calendar__fab"
        aria-label="Add event"
        onClick={() => onAddEvent(selectedDate)}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      >
        <Icon name="plus" size={26} strokeWidth={2.25} />
      </motion.button>
    </div>
  )
}
