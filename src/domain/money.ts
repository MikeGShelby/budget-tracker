/**
 * Money helpers. Everything is an integer count of minor units (cents) so that
 * repeated addition across a projection never accumulates float error.
 */

/** Parse free-text amount input ("1,240.50", "$80", "12") into minor units. */
export function parseAmountToMinor(input: string): number | null {
  const cleaned = input.replace(/[^0-9.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null

  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null

  // Round on the minor unit to avoid 19.99 * 100 === 1998.9999999999998.
  return Math.round(Math.abs(value) * 100)
}

/** Minor units -> a plain editable decimal string ("124050" -> "1240.50"). */
export function minorToInputString(minor: number): string {
  return (Math.abs(minor) / 100).toFixed(2)
}

export interface FormatMoneyOptions {
  locale?: string
  currency?: string
  /** Always show a leading + or -. Zero stays unsigned. */
  signDisplay?: boolean
  /** Drop the decimals when the value is a whole unit. Good for dense cells. */
  compactWhole?: boolean
}

export function formatMoney(minor: number, options: FormatMoneyOptions = {}): string {
  const {
    locale = 'en-US',
    currency = 'USD',
    signDisplay = false,
    compactWhole = false,
  } = options

  const isWhole = minor % 100 === 0
  const fractionDigits = compactWhole && isWhole ? 0 : 2

  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Math.abs(minor) / 100)

  if (!signDisplay) return minor < 0 ? `-${formatted}` : formatted
  if (minor > 0) return `+${formatted}`
  if (minor < 0) return `-${formatted}`
  return formatted
}

/**
 * Balance label for a calendar day cell.
 *
 * A day column is roughly 50px wide, which fits about six glyphs. "$4,499.63"
 * does not fit and silently blows the grid out; the exact figure is one tap
 * away in the day sheet, so the cell trades precision for legibility:
 *   under $1,000 -> whole dollars ($641)
 *   at or above  -> one decimal, compacted ($4.5K)
 */
export function formatMoneyCell(minor: number, options: FormatMoneyOptions = {}): string {
  const { locale = 'en-US', currency = 'USD' } = options
  const abs = Math.abs(minor)

  const formatted =
    abs < 100_000
      ? new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(abs / 100)
      : new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(abs / 100)

  return minor < 0 ? `-${formatted}` : formatted
}

/** Shortened form for tight calendar cells: $1.2k, $14.5k, $980. */
export function formatMoneyCompact(minor: number, options: FormatMoneyOptions = {}): string {
  const { locale = 'en-US', currency = 'USD', signDisplay = false } = options
  const abs = Math.abs(minor)

  // Below $10,000 the full number still fits and is easier to trust.
  if (abs < 1_000_000) return formatMoney(minor, { ...options, compactWhole: true })

  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(abs / 100)

  if (minor < 0) return `-${formatted}`
  if (signDisplay && minor > 0) return `+${formatted}`
  return formatted
}
