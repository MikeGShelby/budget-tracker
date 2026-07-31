import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react'
import type { PanInfo, Transition } from 'motion/react'
import { Icon } from './Icon'
import './Sheet.css'

export type SheetSize = 'auto' | 'tall'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  /** 'auto' hugs content, 'tall' is ~92dvh with an internally scrolling body. */
  size?: SheetSize
  /** Extra class on the panel, for one-off layout tweaks. */
  className?: string
}

/* ── Motion ────────────────────────────────────────────────────────────────
   Damping ratio ≈ 0.97: arrives fast, settles without a visible bounce. */
const SPRING = { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 } as const
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const INSTANT: Transition = { duration: 0 }

/** Past this many px of downward travel, releasing dismisses. */
const DISMISS_DISTANCE = 110
/** …or a flick faster than this, however short. */
const DISMISS_VELOCITY = 500

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  )
}

/* Scroll lock is refcounted so two sheets overlapping never unlock early. */
let scrollLocks = 0

function lockScroll(): void {
  scrollLocks += 1
  document.body.classList.add('has-sheet')
}

function releaseScroll(): void {
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks === 0) document.body.classList.remove('has-sheet')
}

/* Escape must only reach the topmost sheet. */
type CloseRef = { current: () => void }
const escapeStack: CloseRef[] = []

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'auto',
  className,
}: SheetProps): ReactElement | null {
  const reactId = useId()
  const titleId = `${reactId}-title`
  const subtitleId = `${reactId}-subtitle`

  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const dragControls = useDragControls()
  const reduceMotion = useReducedMotion()

  // Stay mounted through the exit animation, then unmount for real.
  const [present, setPresent] = useState(open)
  if (open && !present) setPresent(true)

  // ── Body scroll lock ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    lockScroll()
    return releaseScroll
  }, [open])

  // ── Escape, topmost sheet only ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const entry: CloseRef = closeRef
    escapeStack.push(entry)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (escapeStack[escapeStack.length - 1] !== entry) return
      event.stopPropagation()
      event.preventDefault()
      entry.current()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const index = escapeStack.indexOf(entry)
      if (index >= 0) escapeStack.splice(index, 1)
    }
  }, [open])

  // ── Focus in on open, back out on close ─────────────────────────────────
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Focus the panel itself rather than the first field: on iOS, auto-focusing
    // an input yanks the keyboard up before the sheet has finished springing in.
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true })
    }
  }, [open])

  // ── Focus trap ──────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return

    const items = focusablesIn(panel)
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) {
      event.preventDefault()
      panel.focus({ preventScroll: true })
      return
    }

    const active = document.activeElement
    if (event.shiftKey) {
      if (active === first || active === panel || !panel.contains(active)) {
        event.preventDefault()
        last.focus()
      }
      return
    }
    if (active === last) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      dragControls.start(event)
    },
    [dragControls],
  )

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) {
        closeRef.current()
      }
    },
    [],
  )

  if (!present) return null

  const enter: Transition = reduceMotion ? INSTANT : SPRING
  const exit: Transition = reduceMotion ? INSTANT : { duration: 0.24, ease: EASE_OUT }

  const panelClass = ['sheet', `sheet--${size}`, className].filter(Boolean).join(' ')
  const labelling = title ? { 'aria-labelledby': titleId } : { 'aria-label': 'Dialog' }

  return createPortal(
    <AnimatePresence onExitComplete={() => setPresent(false)}>
      {open ? (
        <>
          <motion.div
            key="scrim"
            className="sheet-scrim"
            aria-hidden="true"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? INSTANT : { duration: 0.2, ease: EASE_OUT }}
          />

          <motion.div
            key="panel"
            ref={panelRef}
            className={panelClass}
            role="dialog"
            aria-modal="true"
            aria-describedby={subtitle ? subtitleId : undefined}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: exit }}
            transition={enter}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.9 }}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            {...labelling}
          >
            {/* Drag originates here only, so a scrolling body never fights the gesture. */}
            <div className="sheet__grip" onPointerDown={startDrag}>
              <span className="sheet__handle" aria-hidden="true" />
              {(title || subtitle) && (
                <div className="sheet__heading">
                  {title && (
                    <h2 className="sheet__title" id={titleId}>
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="sheet__subtitle" id={subtitleId}>
                      {subtitle}
                    </p>
                  )}
                </div>
              )}
            </div>

            <button type="button" className="sheet__close" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={18} strokeWidth={2} />
            </button>

            <div className="sheet__body">{children}</div>

            {footer && <div className="sheet__footer">{footer}</div>}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
