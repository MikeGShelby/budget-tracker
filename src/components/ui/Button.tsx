import type { ComponentPropsWithRef, ReactElement } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** Defaults to 'secondary'. */
  variant?: ButtonVariant
  /** Defaults to 'md'. `md` and `lg` guarantee a >= 44px hit area. */
  size?: ButtonSize
  fullWidth?: boolean
  leadingIcon?: IconName
  trailingIcon?: IconName
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 }

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  const hasLabel = children !== undefined && children !== null && children !== false && children !== ''
  const glyph = ICON_SIZE[size]

  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    fullWidth ? 'btn--block' : null,
    hasLabel ? null : 'btn--icon',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} type={type} {...rest}>
      {leadingIcon && <Icon className="btn__icon" name={leadingIcon} size={glyph} />}
      {hasLabel && <span className="btn__label">{children}</span>}
      {trailingIcon && <Icon className="btn__icon" name={trailingIcon} size={glyph} />}
    </button>
  )
}
