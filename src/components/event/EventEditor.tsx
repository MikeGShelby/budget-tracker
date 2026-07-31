import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { useBudgetStore } from '../../data/store'
import { defaultCategoryFor, getCategory } from '../../domain/categories'
import { minorToInputString, parseAmountToMinor } from '../../domain/money'
import { describeRecurrence } from '../../domain/recurrence'
import type {
  BudgetEvent,
  CategoryId,
  EventDirection,
  IsoDate,
  Recurrence,
} from '../../domain/types'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'
import { CategoryPicker } from './CategoryPicker'
import { RecurrencePicker } from './RecurrencePicker'
import './EventEditor.css'

export interface EventEditorProps {
  open: boolean
  onClose: () => void
  date: IsoDate
  event?: BudgetEvent | null
}

const NO_REPEAT: Recurrence = { frequency: 'once', until: null, secondDayOfMonth: null }

const DIRECTION_OPTIONS = [
  { value: 'income' as const, label: 'Income', icon: 'arrow-up' as const },
  { value: 'expense' as const, label: 'Expense', icon: 'arrow-down' as const },
]

interface Draft {
  title: string
  amount: string
  direction: EventDirection
  categoryId: CategoryId
  startDate: IsoDate
  recurrence: Recurrence
  note: string
}

function draftFrom(event: BudgetEvent | null | undefined, date: IsoDate): Draft {
  if (event) {
    return {
      title: event.title,
      amount: minorToInputString(event.amountMinor),
      direction: event.direction,
      categoryId: event.categoryId,
      startDate: event.startDate,
      recurrence: event.recurrence,
      note: event.note,
    }
  }
  return {
    title: '',
    amount: '',
    direction: 'expense',
    categoryId: defaultCategoryFor('expense'),
    startDate: date,
    recurrence: NO_REPEAT,
    note: '',
  }
}

export function EventEditor({ open, onClose, date, event }: EventEditorProps): ReactElement {
  const saveEvent = useBudgetStore((s) => s.saveEvent)
  const deleteEvent = useBudgetStore((s) => s.deleteEvent)
  const skipOccurrence = useBudgetStore((s) => s.skipOccurrence)
  const currency = useBudgetStore((s) => s.settings.currency)

  const [draft, setDraft] = useState<Draft>(() => draftFrom(event, date))
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed whenever the sheet is raised so a stale draft never leaks between
  // two different events.
  useEffect(() => {
    if (!open) return
    setDraft(draftFrom(event, date))
    setCategoryOpen(false)
    setRepeatOpen(false)
    setConfirmDelete(false)
    setError(null)
  }, [open, event, date])

  const amountMinor = useMemo(() => parseAmountToMinor(draft.amount) ?? 0, [draft.amount])
  const category = getCategory(draft.categoryId)
  const isIncome = draft.direction === 'income'
  const editing = Boolean(event)
  const isRecurring = draft.recurrence.frequency !== 'once'

  const setDirection = (direction: EventDirection): void => {
    setDraft((prev) => {
      // Keep the category on the correct side of the ledger when flipping.
      const stillValid = getCategory(prev.categoryId).direction === direction
      return {
        ...prev,
        direction,
        categoryId: stillValid ? prev.categoryId : defaultCategoryFor(direction),
      }
    })
  }

  const handleSave = async (): Promise<void> => {
    if (amountMinor <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    await saveEvent({
      ...(event ? { id: event.id } : {}),
      title: draft.title.trim() || category.label,
      direction: draft.direction,
      amountMinor,
      categoryId: draft.categoryId,
      startDate: draft.startDate,
      recurrence: draft.recurrence,
      skippedDates: event?.skippedDates ?? [],
      note: draft.note.trim(),
    })
    onClose()
  }

  const previewRecurrence = describeRecurrence({
    ...(event ?? ({} as BudgetEvent)),
    startDate: draft.startDate,
    recurrence: draft.recurrence,
  } as BudgetEvent)

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={editing ? 'Edit event' : 'New event'}
        size="tall"
        footer={
          <div className="editor__footer">
            <Button variant="primary" size="lg" fullWidth disabled={amountMinor <= 0} onClick={() => void handleSave()}>
              {editing ? 'Save changes' : 'Add event'}
            </Button>
            {editing ? (
              <Button variant="danger" size="lg" fullWidth leadingIcon="trash" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="editor">
          {/* Amount — the centrepiece */}
          <div className={`editor__amount${isIncome ? ' editor__amount--in' : ' editor__amount--out'}`}>
            <span className="editor__sign" aria-hidden="true">{isIncome ? '+' : '−'}</span>
            <input
              className="editor__amountinput u-tabular"
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount"
              value={draft.amount}
              onChange={(e) => {
                setError(null)
                setDraft((prev) => ({ ...prev, amount: e.target.value }))
              }}
              onBlur={() => {
                const minor = parseAmountToMinor(draft.amount)
                setDraft((prev) => ({ ...prev, amount: minor ? minorToInputString(minor) : '' }))
              }}
            />
            <span className="editor__currency" aria-hidden="true">{currency}</span>
          </div>

          {error ? <p className="editor__error" role="alert">{error}</p> : null}

          <Segmented
            value={draft.direction}
            onChange={setDirection}
            options={DIRECTION_OPTIONS}
            ariaLabel="Event type"
            accentVar={isIncome ? '--income' : '--expense'}
          />

          <Field
            label="Title"
            variant="stacked"
            placeholder={category.label}
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          />

          <button type="button" className="editor__row u-pressable" onClick={() => setCategoryOpen(true)}>
            <span
              className="editor__rowicon"
              style={{
                background: `oklch(0.72 0.15 ${category.hue} / 0.18)`,
                color: `oklch(0.8 0.15 ${category.hue})`,
              }}
              aria-hidden="true"
            >
              <Icon name={category.icon as never} size={18} />
            </span>
            <span className="editor__rowtext">
              <span className="editor__rowlabel">Category</span>
              <span className="editor__rowvalue">{category.label}</span>
            </span>
            <Icon name="chevron-right" size={18} className="editor__chevron" />
          </button>

          <label className="editor__row editor__row--static">
            <span className="editor__rowicon editor__rowicon--plain" aria-hidden="true">
              <Icon name="calendar" size={18} />
            </span>
            <span className="editor__rowtext">
              <span className="editor__rowlabel">Date</span>
              <input
                type="date"
                className="editor__date"
                value={draft.startDate}
                onChange={(e) =>
                  e.target.value && setDraft((prev) => ({ ...prev, startDate: e.target.value }))
                }
              />
            </span>
          </label>

          <button type="button" className="editor__row u-pressable" onClick={() => setRepeatOpen(true)}>
            <span className="editor__rowicon editor__rowicon--plain" aria-hidden="true">
              <Icon name="repeat" size={18} />
            </span>
            <span className="editor__rowtext">
              <span className="editor__rowlabel">Repeat</span>
              <span className="editor__rowvalue">{previewRecurrence}</span>
            </span>
            <Icon name="chevron-right" size={18} className="editor__chevron" />
          </button>

          <Field
            label="Note"
            variant="stacked"
            placeholder="Optional"
            value={draft.note}
            onChange={(e) => setDraft((prev) => ({ ...prev, note: e.target.value }))}
          />
        </div>
      </Sheet>

      <CategoryPicker
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        direction={draft.direction}
        value={draft.categoryId}
        onChange={(categoryId) => setDraft((prev) => ({ ...prev, categoryId }))}
      />

      <RecurrencePicker
        open={repeatOpen}
        onClose={() => setRepeatOpen(false)}
        startDate={draft.startDate}
        value={draft.recurrence}
        onChange={(recurrence) => setDraft((prev) => ({ ...prev, recurrence }))}
      />

      {/* Deleting one date out of a series is a different action from deleting
          the series — never guess which the user meant. */}
      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete event"
        subtitle={isRecurring ? 'This event repeats. What would you like to remove?' : undefined}
        size="auto"
      >
        <div className="editor__confirm">
          {isRecurring && event ? (
            <>
              <Button
                variant="danger"
                size="lg"
                fullWidth
                onClick={() => {
                  void skipOccurrence(event.id, draft.startDate)
                  setConfirmDelete(false)
                  onClose()
                }}
              >
                Delete this occurrence only
              </Button>
              <Button
                variant="danger"
                size="lg"
                fullWidth
                onClick={() => {
                  void deleteEvent(event.id)
                  setConfirmDelete(false)
                  onClose()
                }}
              >
                Delete the entire series
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              size="lg"
              fullWidth
              onClick={() => {
                if (event) void deleteEvent(event.id)
                setConfirmDelete(false)
                onClose()
              }}
            >
              Delete event
            </Button>
          )}
          <Button variant="ghost" size="lg" fullWidth onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  )
}
