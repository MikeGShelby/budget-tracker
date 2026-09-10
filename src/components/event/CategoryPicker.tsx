import type { ReactElement } from 'react'
import { categoryGroupsFor } from '../../domain/categories'
import type { CategoryId, EventDirection } from '../../domain/types'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import './CategoryPicker.css'

export interface CategoryPickerProps {
  open: boolean
  onClose: () => void
  direction: EventDirection
  value: CategoryId
  onChange: (id: CategoryId) => void
}

export function CategoryPicker({
  open,
  onClose,
  direction,
  value,
  onChange,
}: CategoryPickerProps): ReactElement {
  const groups = categoryGroupsFor(direction)

  return (
    <Sheet open={open} onClose={onClose} title="Category" size="tall">
      <div className="catpick">
        {groups.map((group) => (
          <section key={group.group} className="catpick__group">
            <h3 className="catpick__heading">{group.group}</h3>
            <ul className="catpick__list">
              {group.items.map((category) => {
                const selected = category.id === value
                return (
                  <li key={category.id}>
                    <button
                      type="button"
                      className="catpick__row u-pressable"
                      aria-pressed={selected}
                      onClick={() => {
                        onChange(category.id)
                        onClose()
                      }}
                    >
                      <span
                        className="catpick__icon"
                        style={{
                          background: `oklch(0.72 0.15 ${category.hue} / 0.18)`,
                          color: `oklch(0.8 0.15 ${category.hue})`,
                        }}
                        aria-hidden="true"
                      >
                        <Icon name={category.icon as never} size={18} />
                      </span>
                      <span className="catpick__label">{category.label}</span>
                      {selected ? (
                        <span className="catpick__check" aria-hidden="true">
                          <Icon name="check" size={18} strokeWidth={2.25} />
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  )
}
