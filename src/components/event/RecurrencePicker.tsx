import type { ReactElement } from 'react'
import { ordinal } from '../../domain/recurrence'
import { parseIso } from '../../domain/dates'
import type { IsoDate, Recurrence, RecurrenceFrequency } from '../../domain/types'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import './RecurrencePicker.css'

export interface RecurrencePickerProps {
  open: boolean
  onClose: () => void
  startDate: IsoDate
  value: Recurrence
  onChange: (next: Recurrence) => void
}

const FREQUENCIES: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: 'once', label: 'One time' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]

function explain(frequency: RecurrenceFrequency, startDate: IsoDate, second: number | null): string {
  const date = parseIso(startDate)
  const day = date.getDate()
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date)
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)

  switch (frequency) {
    case 'once':
      return `Happens on ${monthDay} only`
    case 'weekly':
      return `Every ${weekday}`
    case 'biweekly':
      return `Every other ${weekday}`
    case 'semimonthly':
      return `On the ${ordinal(day)} and ${ordinal(second ?? 15)} of each month`
    case 'monthly':
      return `On the ${ordinal(day)} of every month`
    case 'yearly':
      return `On ${monthDay} every year`
  }
}

export function RecurrencePicker({
  open,
  onClose,
  startDate,
  value,
  onChange,
}: RecurrencePickerProps): ReactElement {
  const startDay = parseIso(startDate).getDate()
  const secondDay = value.secondDayOfMonth ?? (startDay >= 15 ? 1 : 15)

  const setFrequency = (frequency: RecurrenceFrequency): void => {
    onChange({
      frequency,
      until: frequency === 'once' ? null : value.until,
      secondDayOfMonth: frequency === 'semimonthly' ? secondDay : null,
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Repeat" size="auto">
      <ul className="recpick__list">
        {FREQUENCIES.map((option) => {
          const selected = option.value === value.frequency
          return (
            <li key={option.value}>
              <button
                type="button"
                className="recpick__row u-pressable"
                aria-pressed={selected}
                onClick={() => setFrequency(option.value)}
              >
                <span className="recpick__text">
                  <span className="recpick__label">{option.label}</span>
                  <span className="recpick__hint">
                    {explain(option.value, startDate, secondDay)}
                  </span>
                </span>
                {selected ? (
                  <span className="recpick__check" aria-hidden="true">
                    <Icon name="check" size={18} strokeWidth={2.25} />
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      {value.frequency === 'semimonthly' ? (
        <label className="recpick__field">
          <span className="recpick__fieldlabel">Second day of month</span>
          <select
            className="recpick__select"
            value={secondDay}
            onChange={(e) =>
              onChange({ ...value, secondDayOfMonth: Number(e.target.value) })
            }
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {value.frequency !== 'once' ? (
        <label className="recpick__field">
          <span className="recpick__fieldlabel">Repeat until</span>
          <input
            type="date"
            className="recpick__date"
            value={value.until ?? ''}
            min={startDate}
            onChange={(e) => onChange({ ...value, until: e.target.value || null })}
          />
          <span className="recpick__hint">
            {value.until ? `Ends ${value.until}` : 'Forever'}
          </span>
        </label>
      ) : null}
    </Sheet>
  )
}
