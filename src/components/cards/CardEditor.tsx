import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { useBudgetStore } from '../../data/store'
import { ISSUERS, defaultStatusFor, dueDateFor, nextDueMonth } from '../../domain/cards'
import { formatShortDate, todayIso } from '../../domain/dates'
import { parseAmountToMinor } from '../../domain/money'
import { ordinal } from '../../domain/recurrence'
import type { CardIssuer } from '../../domain/types'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Sheet } from '../ui/Sheet'
import { CardSwatch } from './CardSwatch'
import './CardEditor.css'

export interface CardEditorProps {
  open: boolean
  onClose: () => void
  /** `null` adds a new card. */
  cardId: string | null
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

interface Draft {
  name: string
  issuer: CardIssuer
  last4: string
  dueDay: number
  closingDay: number | null
  firstBalance: string
}

const BLANK: Draft = { name: '', issuer: 'chase', last4: '', dueDay: 15, closingDay: null, firstBalance: '' }

export function CardEditor({ open, onClose, cardId }: CardEditorProps): ReactElement {
  const existing = useBudgetStore((s) => s.cards.find((c) => c.id === cardId))
  const saveCard = useBudgetStore((s) => s.saveCard)
  const deleteCard = useBudgetStore((s) => s.deleteCard)
  const setCardStatement = useBudgetStore((s) => s.setCardStatement)
  const locale = useBudgetStore((s) => s.settings.locale)

  const [draft, setDraft] = useState<Draft>(BLANK)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editing = Boolean(existing)

  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    setDraft(
      existing
        ? {
            name: existing.name,
            issuer: existing.issuer,
            last4: existing.last4,
            dueDay: existing.dueDay,
            closingDay: existing.closingDay,
            firstBalance: '',
          }
        : BLANK,
    )
    // Seed once per opening; later store writes must not clobber typing.
  }, [open, cardId])

  const today = todayIso()
  const firstMonth = nextDueMonth(draft, today)
  const firstDue = dueDateFor(draft, firstMonth)
  const firstBalance = parseAmountToMinor(draft.firstBalance)
  const patch = (next: Partial<Draft>): void => setDraft((prev) => ({ ...prev, ...next }))

  const save = async (): Promise<void> => {
    const id = await saveCard({
      ...(existing ? { id: existing.id } : {}),
      name: draft.name,
      issuer: draft.issuer,
      last4: draft.last4,
      dueDay: draft.dueDay,
      closingDay: draft.closingDay,
    })
    if (id === null) return
    if (!editing && firstBalance !== null) {
      await setCardStatement(id, firstMonth, firstBalance, defaultStatusFor(draft, firstMonth, today))
    }
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit card' : 'Add a card'}
      size="tall"
      footer={
        confirmDelete && existing ? (
          <div className="cardeditor__footer">
            <p className="cardeditor__warning">
              Delete {existing.name}? Its payments disappear from the calendar. This can't be undone.
            </p>
            <Button
              variant="danger"
              size="lg"
              fullWidth
              onClick={() => {
                void deleteCard(existing.id)
                onClose()
              }}
            >
              Delete card
            </Button>
            <Button variant="ghost" size="lg" fullWidth onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="cardeditor__footer">
            <Button variant="primary" size="lg" fullWidth onClick={() => void save()}>
              {editing ? 'Save changes' : 'Add card'}
            </Button>
            {editing ? (
              <Button variant="ghost" size="md" leadingIcon="trash" onClick={() => setConfirmDelete(true)}>
                Delete card
              </Button>
            ) : null}
          </div>
        )
      }
    >
      <div className="cardeditor">
        <div className="cardeditor__preview">
          <CardSwatch issuer={draft.issuer} last4={draft.last4} size="lg" />
        </div>

        <fieldset className="cardeditor__group">
          <legend className="cardeditor__legend">Bank</legend>
          <div className="cardeditor__issuers">
            {ISSUERS.map((issuer) => (
              <button
                key={issuer.id}
                type="button"
                className={`cardeditor__issuer u-pressable${draft.issuer === issuer.id ? ' cardeditor__issuer--on' : ''}`}
                aria-pressed={draft.issuer === issuer.id}
                onClick={() => patch({ issuer: issuer.id })}
              >
                <span
                  className="cardeditor__issuer-dot"
                  style={{ background: `oklch(0.62 0.15 ${issuer.hue})` }}
                  aria-hidden="true"
                />
                {issuer.label}
              </button>
            ))}
          </div>
        </fieldset>

        <Field
          label="Card name"
          variant="stacked"
          placeholder="e.g. Sapphire Preferred"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
        />

        <Field
          label="Last 4 digits"
          hint="Optional — helps tell cards from the same bank apart."
          variant="stacked"
          inputMode="numeric"
          maxLength={4}
          placeholder="1234"
          value={draft.last4}
          onChange={(e) => patch({ last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
        />

        <div className="cardeditor__days">
          <label className="cardeditor__select-field">
            <span className="cardeditor__legend">Payment due</span>
            <select
              className="cardeditor__select"
              value={draft.dueDay}
              onChange={(e) => patch({ dueDay: Number(e.target.value) })}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  The {ordinal(d)}
                </option>
              ))}
            </select>
          </label>

          <label className="cardeditor__select-field">
            <span className="cardeditor__legend">Statement closes</span>
            <select
              className="cardeditor__select"
              value={draft.closingDay ?? ''}
              onChange={(e) => patch({ closingDay: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">Not sure</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  The {ordinal(d)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="cardeditor__hint">
          Both dates are on your statement. The closing date lets the app tell a final balance from one that's
          still growing.
        </p>

        {!editing ? (
          <Field
            label={`Balance due ${formatShortDate(firstDue, locale)}`}
            hint="Optional — you can add it later from the card."
            variant="stacked"
            inputMode="decimal"
            placeholder="0.00"
            value={draft.firstBalance}
            onChange={(e) => patch({ firstBalance: e.target.value })}
          />
        ) : null}
      </div>
    </Sheet>
  )
}
