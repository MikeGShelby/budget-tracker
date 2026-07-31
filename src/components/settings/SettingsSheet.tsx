import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { useBudgetStore } from '../../data/store'
import { minorToInputString, parseAmountToMinor } from '../../domain/money'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'
import './SettingsSheet.css'

export interface SettingsSheetProps {
  open: boolean
  onClose: () => void
}

// JPY and KRW have no minor units in reality; the cents model still stores them
// as x100, which is a known simplification rather than an oversight.
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY']

const WEEK_OPTIONS = [
  { value: 0 as const, label: 'Sunday' },
  { value: 1 as const, label: 'Monday' },
]

export function SettingsSheet({ open, onClose }: SettingsSheetProps): ReactElement {
  const settings = useBudgetStore((s) => s.settings)
  const updateSettings = useBudgetStore((s) => s.updateSettings)
  const resetAll = useBudgetStore((s) => s.resetAll)

  const [balance, setBalance] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!open) return
    const sign = settings.startingBalanceMinor < 0 ? '-' : ''
    setBalance(`${sign}${minorToInputString(settings.startingBalanceMinor)}`)
    setConfirmReset(false)
  }, [open, settings.startingBalanceMinor])

  const commitBalance = (): void => {
    const magnitude = parseAmountToMinor(balance)
    if (magnitude === null) return
    // Starting balance is the one figure in the app that may legitimately be
    // negative, so the sign is read from the raw text rather than a direction.
    const negative = balance.trim().startsWith('-')
    void updateSettings({ startingBalanceMinor: negative ? -magnitude : magnitude })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Settings" size="tall">
      <div className="settings">
        <section className="settings__section">
          <h3 className="settings__heading">Starting balance</h3>
          <Field
            label="Amount"
            variant="stacked"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            onBlur={commitBalance}
          />
          <Field
            label="As of"
            variant="stacked"
            type="date"
            value={settings.startingBalanceDate}
            onChange={(e) =>
              e.target.value && void updateSettings({ startingBalanceDate: e.target.value })
            }
          />
          <p className="settings__hint">
            Every balance on the calendar is projected forward from this number. Events dated before
            it are ignored.
          </p>
        </section>

        <section className="settings__section">
          <h3 className="settings__heading">Week starts on</h3>
          <Segmented
            value={settings.weekStartsOn}
            onChange={(weekStartsOn) => void updateSettings({ weekStartsOn })}
            options={WEEK_OPTIONS}
            ariaLabel="Week starts on"
          />
        </section>

        <section className="settings__section">
          <h3 className="settings__heading">Currency</h3>
          <select
            className="settings__select"
            value={settings.currency}
            onChange={(e) => void updateSettings({ currency: e.target.value })}
            aria-label="Currency"
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </section>

        <section className="settings__section settings__section--danger">
          <h3 className="settings__heading">Danger zone</h3>
          {confirmReset ? (
            <>
              <p className="settings__hint">
                This permanently deletes every event and resets your starting balance. It cannot be
                undone.
              </p>
              <Button
                variant="danger"
                size="lg"
                fullWidth
                onClick={() => {
                  void resetAll()
                  setConfirmReset(false)
                  onClose()
                }}
              >
                Yes, delete everything
              </Button>
              <Button variant="ghost" size="lg" fullWidth onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="danger" size="lg" fullWidth leadingIcon="trash" onClick={() => setConfirmReset(true)}>
              Reset all data
            </Button>
          )}
        </section>

        <p className="settings__about">
          Ledger · Your data stays on this device.
        </p>
      </div>
    </Sheet>
  )
}
