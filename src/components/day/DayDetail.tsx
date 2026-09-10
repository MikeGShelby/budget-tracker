import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useBudgetStore } from '../../data/store'
import { getCategory } from '../../domain/categories'
import { formatDayTitle } from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import { balanceOn, occurrencesOn } from '../../domain/projection'
import { describeRecurrence } from '../../domain/recurrence'
import type { BudgetEvent, IsoDate } from '../../domain/types'
import { EmptyState } from '../common/EmptyState'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import './DayDetail.css'

export interface DayDetailProps {
  open: boolean
  onClose: () => void
  date: IsoDate
  onEditEvent: (event: BudgetEvent) => void
  onAddEvent: (date: IsoDate) => void
}

export function DayDetail({
  open,
  onClose,
  date,
  onEditEvent,
  onAddEvent,
}: DayDetailProps): ReactElement {
  const events = useBudgetStore((s) => s.events)
  const settings = useBudgetStore((s) => s.settings)
  const reduceMotion = useReducedMotion()

  const { locale, currency } = settings

  const occurrences = useMemo(() => occurrencesOn(events, date), [events, date])
  const balance = useMemo(() => balanceOn(events, settings, date), [events, settings, date])
  const delta = useMemo(
    () => occurrences.reduce((sum, o) => sum + o.signedMinor, 0),
    [occurrences],
  )

  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  const balanceText = formatMoney(balance, { locale, currency })
  const subtitle = `Projected balance ${balanceText}`

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={formatDayTitle(date, locale)}
      subtitle={subtitle}
      size="auto"
      footer={
        <Button variant="secondary" size="lg" fullWidth leadingIcon="plus" onClick={() => onAddEvent(date)}>
          Add event
        </Button>
      }
    >
      {delta !== 0 ? (
        <p className={`daydetail__delta u-tabular${delta > 0 ? ' daydetail__delta--in' : ' daydetail__delta--out'}`}>
          {formatMoney(delta, { locale, currency, signDisplay: true })}
          <span className="daydetail__deltalabel">on this day</span>
        </p>
      ) : null}

      {occurrences.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Nothing scheduled"
          description="Your balance simply carries forward on this day."
        />
      ) : (
        <ul className="daydetail__list">
          {occurrences.map((occurrence, index) => {
            const category = getCategory(occurrence.categoryId)
            const source = eventsById.get(occurrence.eventId)
            const income = occurrence.signedMinor > 0

            return (
              <motion.li
                key={occurrence.key}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.24, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }
                }
              >
                <button
                  type="button"
                  className="daydetail__row u-pressable"
                  onClick={() => source && onEditEvent(source)}
                  disabled={!source}
                >
                  <span
                    className="daydetail__icon"
                    style={{
                      background: `oklch(0.72 0.15 ${category.hue} / 0.18)`,
                      color: `oklch(0.8 0.15 ${category.hue})`,
                    }}
                    aria-hidden="true"
                  >
                    <Icon name={category.icon as never} size={18} />
                  </span>

                  <span className="daydetail__text">
                    <span className="daydetail__title">{occurrence.title}</span>
                    <span className="daydetail__meta">
                      {occurrence.isRecurring && source ? (
                        <>
                          <Icon name="repeat" size={11} strokeWidth={2} />
                          {describeRecurrence(source)}
                        </>
                      ) : (
                        category.label
                      )}
                    </span>
                  </span>

                  <span
                    className={`daydetail__amount u-tabular${income ? ' daydetail__amount--in' : ' daydetail__amount--out'}`}
                  >
                    {formatMoney(occurrence.signedMinor, { locale, currency, signDisplay: true })}
                  </span>
                </button>
              </motion.li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
