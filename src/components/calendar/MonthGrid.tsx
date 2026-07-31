import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { PanInfo } from 'motion/react'
import { isSameMonth, monthGridDates, todayIso, weekdayLabels } from '../../domain/dates'
import { projectRange } from '../../domain/projection'
import type { BudgetEvent, IsoDate, Settings } from '../../domain/types'
import { DayCell } from './DayCell'
import './MonthGrid.css'

export interface MonthGridProps {
  monthAnchor: IsoDate
  selectedDate: IsoDate
  events: BudgetEvent[]
  settings: Settings
  /** +1 when moving to a later month, -1 earlier. Drives the slide direction. */
  direction: number
  onSelectDay: (date: IsoDate) => void
  onSwipeMonth: (delta: number) => void
}

const SWIPE_DISTANCE = 60
const SWIPE_VELOCITY = 400

export function MonthGrid({
  monthAnchor,
  selectedDate,
  events,
  settings,
  direction,
  onSelectDay,
  onSwipeMonth,
}: MonthGridProps): ReactElement {
  const reduceMotion = useReducedMotion()
  const today = todayIso()

  const dates = useMemo(
    () => monthGridDates(monthAnchor, settings.weekStartsOn),
    [monthAnchor, settings.weekStartsOn],
  )

  // One projection for the whole 42-cell window. Calling balanceOn per cell
  // would re-walk the entire event history 42 times over.
  const projection = useMemo(() => {
    const from = dates[0]
    const to = dates[dates.length - 1]
    if (!from || !to) return null
    return projectRange(events, settings, from, to)
  }, [dates, events, settings])

  const weekdays = useMemo(
    () => weekdayLabels(settings.weekStartsOn, settings.locale),
    [settings.weekStartsOn, settings.locale],
  )

  const handleDragEnd = (_: unknown, info: PanInfo): void => {
    const { offset, velocity } = info
    // Ignore gestures that are mostly vertical — those belong to the page.
    if (Math.abs(offset.x) < Math.abs(offset.y)) return
    if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) onSwipeMonth(1)
    else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) onSwipeMonth(-1)
  }

  const slide = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: direction >= 0 ? 44 : -44 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: direction >= 0 ? -44 : 44 },
      }

  return (
    <div className="monthgrid">
      <div className="monthgrid__weekdays" aria-hidden="true">
        {weekdays.map((label, i) => (
          <span key={`${label}-${i}`} className="monthgrid__weekday">
            {label}
          </span>
        ))}
      </div>

      <div className="monthgrid__viewport">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={monthAnchor.slice(0, 7)}
            className="monthgrid__cells"
            role="grid"
            aria-label="Month"
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.14}
            onDragEnd={handleDragEnd}
            initial={slide.initial}
            animate={slide.animate}
            exit={slide.exit}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 460, damping: 40, mass: 0.8 }
            }
          >
            {dates.map((date) => (
              <DayCell
                key={date}
                date={date}
                projection={projection?.days.get(date)}
                inMonth={isSameMonth(date, monthAnchor)}
                isToday={date === today}
                isSelected={date === selectedDate}
                locale={settings.locale}
                currency={settings.currency}
                onSelect={onSelectDay}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
