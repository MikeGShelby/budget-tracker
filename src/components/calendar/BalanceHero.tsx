import type { ReactElement } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { formatMoney } from '../../domain/money'
import { formatShortDate, todayIso } from '../../domain/dates'
import type { IsoDate } from '../../domain/types'
import { Icon } from '../ui/Icon'
import './BalanceHero.css'

export interface BalanceHeroProps {
  /** Projected balance at the end of `date`. */
  balanceMinor: number
  date: IsoDate
  monthIncomeMinor: number
  monthExpenseMinor: number
  locale: string
  currency: string
}

export function BalanceHero({
  balanceMinor,
  date,
  monthIncomeMinor,
  monthExpenseMinor,
  locale,
  currency,
}: BalanceHeroProps): ReactElement {
  const reduceMotion = useReducedMotion()
  const negative = balanceMinor < 0
  const isToday = date === todayIso()

  const caption = isToday ? 'Balance today' : `Projected for ${formatShortDate(date, locale)}`
  const amount = formatMoney(balanceMinor, { locale, currency })

  return (
    <section className="hero" aria-label="Projected balance">
      <p className="hero__caption">{caption}</p>

      <div className="hero__amountwrap">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.p
            key={amount}
            className={`hero__amount u-tabular${negative ? ' hero__amount--negative' : ''}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {amount}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="hero__flows">
        <span className="hero__flow hero__flow--in">
          <Icon name="arrow-up" size={13} strokeWidth={2.25} />
          <span className="u-tabular">{formatMoney(monthIncomeMinor, { locale, currency, compactWhole: true })}</span>
        </span>
        <span className="hero__divider" aria-hidden="true" />
        <span className="hero__flow hero__flow--out">
          <Icon name="arrow-down" size={13} strokeWidth={2.25} />
          <span className="u-tabular">{formatMoney(monthExpenseMinor, { locale, currency, compactWhole: true })}</span>
        </span>
      </div>
    </section>
  )
}
