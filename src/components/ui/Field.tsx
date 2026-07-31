import { useId } from 'react'
import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import './Field.css'

export type FieldVariant = 'floating' | 'stacked'

/** `prefix` is an RDFa attribute on the intrinsic element; we reuse the name. */
export interface FieldProps extends Omit<ComponentPropsWithRef<'input'>, 'prefix'> {
  /** Always required — every input gets a real, associated label. */
  label: string
  /** Renders in place of the hint and marks the field invalid. */
  error?: string
  /** Quiet helper copy below the field. */
  hint?: string
  leadingIcon?: IconName
  /** Rendered inside the field, before the input (e.g. a currency symbol). */
  prefix?: ReactNode
  /** Rendered inside the field, after the input (e.g. a unit or clear button). */
  trailing?: ReactNode
  /** 'floating' (default) animates the label up; 'stacked' pins it above. */
  variant?: FieldVariant
  /** Class for the outer wrapper. */
  className?: string
}

export function Field({
  label,
  error,
  hint,
  leadingIcon,
  prefix,
  trailing,
  variant = 'floating',
  className,
  id,
  placeholder,
  ...rest
}: FieldProps): ReactElement {
  const reactId = useId()
  const inputId = id ?? `${reactId}-input`
  const errorId = `${reactId}-error`
  const hintId = `${reactId}-hint`

  const invalid = Boolean(error)
  const describedBy = invalid ? errorId : hint ? hintId : undefined

  const classes = [
    'field',
    `field--${variant}`,
    invalid ? 'field--invalid' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {variant === 'stacked' && (
        <label className="field__static-label" htmlFor={inputId}>
          {label}
        </label>
      )}

      <div className="field__shell">
        {leadingIcon && (
          <span className="field__adornment field__adornment--icon">
            <Icon name={leadingIcon} size={20} />
          </span>
        )}
        {prefix && <span className="field__adornment">{prefix}</span>}

        <div className="field__control">
          <input
            {...rest}
            id={inputId}
            className="field__input"
            /* A non-empty placeholder is what drives :placeholder-shown, which is
               what floats the label — no JS state, no controlled/uncontrolled split. */
            placeholder={placeholder ?? ' '}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
          {variant === 'floating' && (
            <label className="field__label" htmlFor={inputId}>
              {label}
            </label>
          )}
        </div>

        {trailing && <span className="field__adornment">{trailing}</span>}
      </div>

      {invalid ? (
        <p className="field__message field__message--error" id={errorId} role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : hint ? (
        <p className="field__message" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
