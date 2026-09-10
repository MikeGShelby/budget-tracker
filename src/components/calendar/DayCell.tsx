import { memo } from 'react'
import type { ReactElement } from 'react'
import { getCategory } from '../../domain/categories'
import { formatMoney, formatMoneyCell } from '../../domain/money'
import type { DayProjection, IsoDate } from '../../domain/types'
import { Icon } from '../ui/Icon'
import './DayCell.css'

export interface DayCellProps {
  date: IsoDate
  projection: DayProjection | undefined
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  locale: string
  currency: string
  onSelect: (date: IsoDate) => void
}

const MAX_DOTS = 3

function DayCellBase({
  date,
  projection,
  inMonth,
  isToday,
  isSelected,
  locale,
  currency,
  onSelect,
}: DayCellProps): ReactElement {
  const dayNumber = Number(date.slice(8, 10))
  const hasChange = projection?.hasChange ?? false
  const delta = projection?.deltaMinor ?? 0
  const balance = projection?.balanceMinor ?? 0
  const occurrences = projection?.occurrences ?? []

  // Overdraft is the single most valuable thing this calendar can warn about,
  // so it outranks the normal income/expense tint.
  const overdrawn = balance < 0

  const classes = [
    'daycell',
    inMonth ? null : 'daycell--muted',
    isToday ? 'daycell--today' : null,
    isSelected ? 'daycell--selected' : null,
    hasChange ? 'daycell--change' : null,
    overdrawn ? 'daycell--overdrawn' : null,
  ]
    .filter(Boolean)
    .join(' ')

  const balanceClass = [
    'daycell__balance',
    'u-tabular',
    overdrawn ? 'daycell__balance--negative' : delta > 0 ? 'daycell__balance--up' : 'daycell__balance--down',
  ].join(' ')

  const label = buildAriaLabel({ date, locale, currency, hasChange, balance, occurrences })

  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      aria-current={isToday ? 'date' : undefined}
      aria-pressed={isSelected}
      onClick={() => onSelect(date)}
    >
      <span className="daycell__num">{dayNumber}</span>

      {hasChange ? (
        <span className={balanceClass}>
          {formatMoneyCell(balance, { locale, currency })}
        </span>
      ) : (
        <span className="daycell__balance daycell__balance--empty" aria-hidden="true" />
      )}

      <span className="daycell__dots" aria-hidden="true">
        {occurrences.slice(0, MAX_DOTS).map((occurrence) => (
          <span
            key={occurrence.key}
            className="daycell__dot"
            style={{ background: `oklch(0.74 0.16 ${getCategory(occurrence.categoryId).hue})` }}
          />
        ))}
        {occurrences.length > MAX_DOTS ? (
          <span className="daycell__more">+{occurrences.length - MAX_DOTS}</span>
        ) : null}
      </span>

      {overdrawn ? (
        <span className="daycell__alert" aria-hidden="true">
          <Icon name="alert" size={11} strokeWidth={2.25} />
        </span>
      ) : null}
    </button>
  )
}

function buildAriaLabel({
  date,
  locale,
  currency,
  hasChange,
  balance,
  occurrences,
}: {
  date: IsoDate
  locale: string
  currency: string
  hasChange: boolean
  balance: number
  occurrences: DayProjection['occurrences']
}): string {
  const [y, m, d] = date.split('-').map(Number)
  const readable = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
  }).format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1))

  if (!hasChange) return `${readable}, no change`

  const count = occurrences.length
  const events = count === 1 ? '1 event' : `${count} events`
  const money = formatMoney(balance, { locale, currency })
  const warning = balance < 0 ? ', overdrawn' : ''
  return `${readable}, balance ${money}, ${events}${warning}`
}

export const DayCell = memo(DayCellBase)
