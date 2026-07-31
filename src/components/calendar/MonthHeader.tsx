import type { ReactElement } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { formatMonthTitle } from '../../domain/dates'
import type { IsoDate } from '../../domain/types'
import { Icon } from '../ui/Icon'
import './MonthHeader.css'

export interface MonthHeaderProps {
  monthAnchor: IsoDate
  locale: string
  /** Hides the "Today" shortcut when the current month is already in view. */
  isCurrentMonth: boolean
  direction: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onOpenSettings: () => void
}

export function MonthHeader({
  monthAnchor,
  locale,
  isCurrentMonth,
  direction,
  onPrev,
  onNext,
  onToday,
  onOpenSettings,
}: MonthHeaderProps): ReactElement {
  const reduceMotion = useReducedMotion()
  const title = formatMonthTitle(monthAnchor, locale)
  const [month = title, year = ''] = title.split(' ')

  return (
    <header className="monthhdr">
      <div className="monthhdr__title">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.h1
            key={monthAnchor.slice(0, 7)}
            className="monthhdr__month"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: direction >= 0 ? 12 : -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: direction >= 0 ? -12 : 12 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {month}
            <span className="monthhdr__year">{year}</span>
          </motion.h1>
        </AnimatePresence>
      </div>

      <div className="monthhdr__actions">
        {!isCurrentMonth ? (
          <button type="button" className="monthhdr__today u-pressable" onClick={onToday}>
            Today
          </button>
        ) : null}

        <button
          type="button"
          className="monthhdr__nav u-pressable"
          aria-label="Previous month"
          onClick={onPrev}
        >
          <Icon name="chevron-left" size={20} />
        </button>
        <button
          type="button"
          className="monthhdr__nav u-pressable"
          aria-label="Next month"
          onClick={onNext}
        >
          <Icon name="chevron-right" size={20} />
        </button>
        <button
          type="button"
          className="monthhdr__nav u-pressable"
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <Icon name="settings" size={19} />
        </button>
      </div>
    </header>
  )
}
