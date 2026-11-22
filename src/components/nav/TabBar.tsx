import type { ReactElement } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import './TabBar.css'

export type TabId = 'calendar' | 'cards'

export interface TabBarProps {
  active: TabId
  onChange: (tab: TabId) => void
  /** Count shown on the Cards tab: cards whose statement closed but isn't entered. */
  cardsBadge: number
}

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: IconName }> = [
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'cards', label: 'Cards', icon: 'card' },
]

export function TabBar({ active, onChange, cardsBadge }: TabBarProps): ReactElement {
  const reduceMotion = useReducedMotion()

  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((tab) => {
        const selected = tab.id === active
        const badge = tab.id === 'cards' && cardsBadge > 0 ? cardsBadge : 0
        return (
          <button
            key={tab.id}
            type="button"
            className={`tabbar__tab${selected ? ' tabbar__tab--active' : ''}`}
            aria-current={selected ? 'page' : undefined}
            aria-label={badge > 0 ? `${tab.label}, ${badge} need${badge === 1 ? 's' : ''} updating` : tab.label}
            onClick={() => onChange(tab.id)}
          >
            {selected ? (
              <motion.span
                layoutId="tabbar-pill"
                className="tabbar__pill"
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }}
                aria-hidden="true"
              />
            ) : null}
            <span className="tabbar__icon" aria-hidden="true">
              <Icon name={tab.icon} size={22} strokeWidth={selected ? 2 : 1.75} />
              {badge > 0 ? <span className="tabbar__badge">{badge}</span> : null}
            </span>
            <span className="tabbar__label">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
