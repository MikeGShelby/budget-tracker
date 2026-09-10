import type { ReactElement, ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import './EmptyState.css'

export interface EmptyStateProps {
  icon?: IconName
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon = 'calendar', title, description, action }: EmptyStateProps): ReactElement {
  return (
    <div className="empty">
      <span className="empty__glyph" aria-hidden="true">
        <Icon name={icon} size={24} />
      </span>
      <p className="empty__title">{title}</p>
      {description ? <p className="empty__desc">{description}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  )
}
