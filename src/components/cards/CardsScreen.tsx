import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useBudgetStore } from '../../data/store'
import {
  daysBetween,
  findHandEnteredCardPayments,
  formatMonthKey,
  getIssuer,
  needsUpdate,
  nextDueDate,
  resolvePayment,
} from '../../domain/cards'
import type { ResolvedPayment } from '../../domain/cards'
import { formatShortDate, todayIso } from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import type { CreditCard, MonthKey } from '../../domain/types'
import { EmptyState } from '../common/EmptyState'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { CardSwatch } from './CardSwatch'
import './CardsScreen.css'

export interface CardsScreenProps {
  onOpenCard: (cardId: string, month: MonthKey) => void
  onAddCard: () => void
}

interface Row {
  card: CreditCard
  dueDate: string
  payment: ResolvedPayment | null
  flagged: boolean
}

function dueLabel(today: string, dueDate: string, locale: string): string {
  const days = daysBetween(today, dueDate)
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
  return `Due ${formatShortDate(dueDate, locale)} · ${when}`
}

function statusOf(row: Row, locale: string): { label: string; tone: 'final' | 'estimate' | 'warn' | 'muted' } {
  const { payment } = row
  // Flagged: the statement is out but its final amount isn't in yet.
  if (row.flagged) {
    return payment?.basis === 'entered'
      ? { label: 'Confirm final', tone: 'warn' }
      : { label: 'Add balance', tone: 'warn' }
  }
  if (payment === null) return { label: 'No balance yet', tone: 'muted' }
  if (payment.basis === 'carried' && payment.carriedFrom) {
    const month = formatMonthKey(payment.carriedFrom, locale).split(' ')[0] ?? ''
    return { label: `Est. from ${month}`, tone: 'estimate' }
  }
  return payment.status === 'closed'
    ? { label: 'Final', tone: 'final' }
    : { label: 'Still open', tone: 'estimate' }
}

export function CardsScreen({ onOpenCard, onAddCard }: CardsScreenProps): ReactElement {
  const cards = useBudgetStore((s) => s.cards)
  const events = useBudgetStore((s) => s.events)
  const deleteEvent = useBudgetStore((s) => s.deleteEvent)
  // Removing an event is permanent, so the first tap arms the button and only
  // a second tap on the same row deletes.
  const [armed, setArmed] = useState<string | null>(null)
  const { locale, currency } = useBudgetStore((s) => s.settings)
  const reduceMotion = useReducedMotion()
  const today = todayIso()

  const rows = useMemo<Row[]>(
    () =>
      cards
        .map((card) => {
          const dueDate = nextDueDate(card, today)
          return {
            card,
            dueDate,
            payment: resolvePayment(card, dueDate.slice(0, 7)),
            flagged: needsUpdate(card, today),
          }
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.card.name.localeCompare(b.card.name)),
    [cards, today],
  )

  const duplicates = useMemo(() => findHandEnteredCardPayments(events, cards, today), [events, cards, today])

  const total = rows.reduce((sum, row) => sum + (row.payment?.amountMinor ?? 0), 0)
  const flaggedCount = rows.filter((row) => row.flagged).length
  const money = (minor: number): string => formatMoney(minor, { locale, currency })

  return (
    <div className="cards">
      <header className="cards__header">
        <h1 className="cards__title">Cards</h1>
        <button type="button" className="cards__add u-pressable" aria-label="Add card" onClick={onAddCard}>
          <Icon name="plus" size={20} strokeWidth={2.25} />
        </button>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon="card"
          title="No cards yet"
          description="Add each credit card once. Its payment shows up on the calendar every month, and you update the balance right here."
          action={
            <Button variant="primary" size="lg" leadingIcon="plus" onClick={onAddCard}>
              Add a card
            </Button>
          }
        />
      ) : (
        <>
          <section className="cards__summary" aria-label="Upcoming card payments">
            <p className="cards__summary-label">Next payments</p>
            <p className="cards__summary-total u-tabular">{money(total)}</p>
            <p className="cards__summary-meta">
              {rows.length} {rows.length === 1 ? 'card' : 'cards'}
              {flaggedCount > 0 ? (
                <span className="cards__summary-flag">
                  {' · '}
                  {flaggedCount} {flaggedCount === 1 ? 'needs' : 'need'} a balance
                </span>
              ) : null}
            </p>
          </section>

          {duplicates.length > 0 ? (
            <section className="dupes" aria-labelledby="dupes-title">
              <div className="dupes__head">
                <Icon name="alert" size={16} strokeWidth={2.25} />
                <h2 id="dupes-title" className="dupes__title">
                  Remove payments you added by hand?
                </h2>
              </div>
              <p className="dupes__text">
                These calendar events look like card payments you entered yourself. Your cards now add those
                payments automatically, so keeping both would subtract each one twice.
              </p>
              <ul className="dupes__list">
                {duplicates.map(({ event, nextDate }) => {
                  const repeats = event.recurrence.frequency !== 'once'
                  const isArmed = armed === event.id
                  return (
                    <li key={event.id} className="dupes__row">
                      <span className="dupes__info">
                        <span className="dupes__name">{event.title}</span>
                        <span className="dupes__meta">
                          {formatShortDate(nextDate, locale)}
                          {repeats ? ' · repeats' : ''} · {money(event.amountMinor)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className={`dupes__remove u-pressable${isArmed ? ' dupes__remove--armed' : ''}`}
                        onClick={() => {
                          if (!isArmed) {
                            setArmed(event.id)
                            return
                          }
                          setArmed(null)
                          void deleteEvent(event.id)
                        }}
                        aria-label={
                          isArmed
                            ? `Confirm: delete ${event.title}${repeats ? ' and every repeat' : ''}`
                            : `Remove ${event.title}`
                        }
                      >
                        {isArmed ? (repeats ? 'Delete all' : 'Delete') : 'Remove'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          <ul className="cards__list">
            {rows.map((row, index) => {
              const status = statusOf(row, locale)
              const issuer = getIssuer(row.card.issuer)
              return (
                <motion.li
                  key={row.card.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.22, delay: index * 0.025 }}
                >
                  <button
                    type="button"
                    className={`cardrow u-pressable${row.flagged ? ' cardrow--flagged' : ''}`}
                    onClick={() => onOpenCard(row.card.id, row.dueDate.slice(0, 7))}
                    aria-label={`${row.card.name}, ${dueLabel(today, row.dueDate, locale)}, ${
                      row.payment ? money(row.payment.amountMinor) : 'no balance'
                    }, ${status.label}`}
                  >
                    <CardSwatch issuer={row.card.issuer} last4={row.card.last4} />
                    <span className="cardrow__text">
                      <span className="cardrow__name">{row.card.name}</span>
                      <span className="cardrow__due">{dueLabel(today, row.dueDate, locale)}</span>
                    </span>
                    <span className="cardrow__right">
                      <span
                        className={`cardrow__amount u-tabular${row.payment?.isEstimate ? ' cardrow__amount--estimate' : ''}`}
                      >
                        {row.payment ? money(row.payment.amountMinor) : '—'}
                      </span>
                      <span className={`cardrow__status cardrow__status--${status.tone}`}>{status.label}</span>
                    </span>
                    <span className="sr-only">{issuer.label}</span>
                  </button>
                </motion.li>
              )
            })}
          </ul>

          <p className="cards__hint">
            Tap a card to update its balance. Months without a balance reuse the last one as an estimate.
          </p>
        </>
      )}
    </div>
  )
}
