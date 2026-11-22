import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { useBudgetStore } from '../../data/store'
import {
  addMonthsToKey,
  closingDateFor,
  defaultStatusFor,
  describeDueDay,
  dueDateFor,
  formatMonthKey,
  resolvePayment,
} from '../../domain/cards'
import { formatShortDate, todayIso } from '../../domain/dates'
import { formatMoney, minorToInputString, parseAmountToMinor } from '../../domain/money'
import type { MonthKey, StatementStatus } from '../../domain/types'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'
import { CardSwatch } from './CardSwatch'
import './CardSheet.css'

export interface CardSheetProps {
  open: boolean
  onClose: () => void
  cardId: string | null
  /** The month to open on — usually the next one due. */
  month: MonthKey
  onEditCard: (cardId: string) => void
}

const STATUS_OPTIONS = [
  { value: 'closed' as const, label: 'Statement closed' },
  { value: 'open' as const, label: 'Still open' },
]

export function CardSheet({ open, onClose, cardId, month, onEditCard }: CardSheetProps): ReactElement {
  const card = useBudgetStore((s) => s.cards.find((c) => c.id === cardId))
  const { locale, currency } = useBudgetStore((s) => s.settings)
  const setCardStatement = useBudgetStore((s) => s.setCardStatement)
  const clearCardStatement = useBudgetStore((s) => s.clearCardStatement)
  const today = todayIso()

  const [selected, setSelected] = useState<MonthKey>(month)
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<StatementStatus>('closed')

  // The chips stay anchored on the month the sheet opened with, so tapping
  // between them doesn't make the row slide out from under the finger.
  const months = useMemo(() => [addMonthsToKey(month, -1), month, addMonthsToKey(month, 1)], [month])

  // Re-seed from what is stored whenever the sheet opens or the month changes.
  useEffect(() => {
    if (!open) return
    setSelected(month)
  }, [open, month, cardId])

  useEffect(() => {
    if (!open || !card) return
    const entry = card.statements[selected]
    setAmount(entry ? minorToInputString(entry.amountMinor) : '')
    setStatus(entry ? entry.status : defaultStatusFor(card, selected, today))
    // `card` is deliberately left out: re-seeding on every store write would
    // wipe what the user is typing the moment another card saves.
  }, [open, selected, cardId])

  const money = (minor: number): string => formatMoney(minor, { locale, currency })
  const symbol = useMemo(
    () =>
      new Intl.NumberFormat(locale, { style: 'currency', currency })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value ?? currency,
    [locale, currency],
  )
  const parsed = parseAmountToMinor(amount)
  const entry = card?.statements[selected]
  const resolved = card ? resolvePayment(card, selected) : null
  const closing = card ? closingDateFor(card, selected) : null
  const dueDate = card ? dueDateFor(card, selected) : ''

  const hint = (() => {
    if (!card) return ''
    if (entry) {
      if (entry.status === 'closed') return 'Final balance for this statement.'
      if (closing && closing < today) {
        return `The statement closed ${formatShortDate(closing, locale)} — enter the final amount and mark it closed.`
      }
      return closing
        ? `Still growing until the statement closes ${formatShortDate(closing, locale)}.`
        : 'Still growing until the statement closes.'
    }
    if (resolved && resolved.carriedFrom) {
      const from = formatMonthKey(resolved.carriedFrom, locale).split(' ')[0]
      return `Using ${from}'s ${money(resolved.amountMinor)} as an estimate until you enter this one.`
    }
    return 'Enter the full statement balance — this card is paid in full.'
  })()

  const save = async (): Promise<void> => {
    if (!card || parsed === null) return
    await setCardStatement(card.id, selected, parsed, status)
    onClose()
  }

  return (
    <Sheet
      open={open && Boolean(card)}
      onClose={onClose}
      title={card?.name ?? ''}
      subtitle={card ? `${describeDueDay(card)}${card.last4 ? ` · ••${card.last4}` : ''}` : undefined}
      size="auto"
      footer={
        <div className="cardsheet__footer">
          <Button variant="primary" size="lg" fullWidth disabled={parsed === null} onClick={() => void save()}>
            Save balance
          </Button>
          <div className="cardsheet__secondary">
            <Button variant="ghost" size="md" leadingIcon="pencil" onClick={() => card && onEditCard(card.id)}>
              Edit card
            </Button>
            {entry ? (
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  if (!card) return
                  void clearCardStatement(card.id, selected)
                  setAmount('')
                }}
              >
                Clear this month
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      {card ? (
        <div className="cardsheet">
          <div className="cardsheet__months" role="radiogroup" aria-label="Payment month">
            {months.map((key) => {
              const isSelected = key === selected
              const own = card.statements[key]
              const due = dueDateFor(card, key)
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`cardsheet__month u-pressable${isSelected ? ' cardsheet__month--on' : ''}`}
                  onClick={() => setSelected(key)}
                >
                  <span className="cardsheet__month-date">{formatShortDate(due, locale)}</span>
                  <span className="cardsheet__month-amount u-tabular">
                    {own ? money(own.amountMinor) : 'Not set'}
                  </span>
                  {due < today ? <span className="cardsheet__month-tag">Past</span> : null}
                </button>
              )
            })}
          </div>

          <div className="cardsheet__amount">
            <CardSwatch issuer={card.issuer} last4={card.last4} size="lg" />
            <label className="cardsheet__amount-field">
              <span className="cardsheet__amount-label">Pay on {formatShortDate(dueDate, locale)}</span>
              <span className="cardsheet__amount-row">
                <span className="cardsheet__currency" aria-hidden="true">
                  {symbol}
                </span>
                <input
                  className="cardsheet__input u-tabular"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={resolved ? minorToInputString(resolved.amountMinor) : '0.00'}
                  aria-label={`Balance due ${formatShortDate(dueDate, locale)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => {
                    const minor = parseAmountToMinor(amount)
                    if (minor !== null) setAmount(minorToInputString(minor))
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save()
                  }}
                />
              </span>
            </label>
          </div>

          <p className="cardsheet__hint">{hint}</p>

          <Segmented
            value={status}
            onChange={setStatus}
            options={STATUS_OPTIONS}
            ariaLabel="Statement status"
            accentVar={status === 'closed' ? '--income' : '--accent'}
          />
          <p className="cardsheet__status-hint">
            {status === 'closed'
              ? 'The statement is out, so this amount is final.'
              : 'Charges are still adding up, so this is an estimate.'}
            {closing
              ? ` ${closing < today ? 'Closed' : 'Closes'} ${formatShortDate(closing, locale)}.`
              : ''}
          </p>
        </div>
      ) : null}
    </Sheet>
  )
}
