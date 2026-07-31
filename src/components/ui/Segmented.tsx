import { useCallback, useId, useRef } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { Transition } from 'motion/react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import './Segmented.css'

export interface SegmentedOption<T> {
  value: T
  label: string
  icon?: IconName
}

export interface SegmentedProps<T> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentedOption<T>>
  /** Required: the control has no visible label of its own. */
  ariaLabel: string
  /**
   * Token name used to tint the selected pill, e.g. '--income' or '--expense'.
   * Defaults to '--accent'.
   */
  accentVar?: string
  className?: string
}

/** CSS custom properties are not in React's CSSProperties. */
type CssVars = CSSProperties & { [key: `--${string}`]: string }

const INDICATOR_SPRING = { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 } as const
const INSTANT: Transition = { duration: 0 }

const NAV_KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']

export function Segmented<T>({
  value,
  onChange,
  options,
  ariaLabel,
  accentVar = '--accent',
  className,
}: SegmentedProps<T>): ReactElement {
  const indicatorId = useId()
  const reduceMotion = useReducedMotion()
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!NAV_KEYS.includes(event.key)) return
      if (options.length === 0) return
      event.preventDefault()

      const current = options.findIndex((option) => option.value === value)
      const from = current < 0 ? 0 : current

      let next: number
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        next = (from + 1) % options.length
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        next = (from - 1 + options.length) % options.length
      } else if (event.key === 'Home') {
        next = 0
      } else {
        next = options.length - 1
      }

      const option = options[next]
      if (!option) return
      onChange(option.value)
      buttonsRef.current[next]?.focus()
    },
    [onChange, options, value],
  )

  const style: CssVars = { '--seg-accent': `var(${accentVar})` }
  const classes = ['segmented', className].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      style={style}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={`${index}-${String(option.value)}`}
            ref={(node) => {
              buttonsRef.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className="segmented__option"
            onClick={() => {
              if (!selected) onChange(option.value)
            }}
          >
            {selected && (
              <motion.span
                className="segmented__indicator"
                layoutId={indicatorId}
                transition={reduceMotion ? INSTANT : INDICATOR_SPRING}
                aria-hidden="true"
              />
            )}
            <span className="segmented__content">
              {option.icon && <Icon name={option.icon} size={16} />}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
