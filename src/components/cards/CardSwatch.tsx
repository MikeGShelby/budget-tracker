import type { CSSProperties, ReactElement } from 'react'
import { getIssuer } from '../../domain/cards'
import type { CardIssuer } from '../../domain/types'
import './CardSwatch.css'

export interface CardSwatchProps {
  issuer: CardIssuer
  last4?: string
  size?: 'sm' | 'lg'
}

type CssVars = CSSProperties & { [key: `--${string}`]: string }

/** A small credit-card shape in the issuer's colour. Colour only — no logos. */
export function CardSwatch({ issuer, last4 = '', size = 'sm' }: CardSwatchProps): ReactElement {
  const style: CssVars = { '--swatch-hue': String(getIssuer(issuer).hue) }
  return (
    <span className={`swatch swatch--${size}`} style={style} aria-hidden="true">
      <span className="swatch__chip" />
      {last4 ? <span className="swatch__digits u-tabular">{last4}</span> : null}
    </span>
  )
}
