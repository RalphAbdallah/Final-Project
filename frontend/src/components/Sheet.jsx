import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const SPRING = { type: 'spring', bounce: 0, duration: 0.4 };
// Closing: dim and shadow are gone while the panel is still well short of the bottom.
const CLEAR = { duration: 0.16, ease: 'easeOut' };
const SHADOW = '0 -8px 40px rgba(0, 0, 0, 0.3)';
const SHADOW_OFF = '0 -8px 40px rgba(0, 0, 0, 0)';
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 600;

/**
 * The background color at the top of the screen, under the status bar. iPhone Safari
 * (iOS 26) colors its status bar from the fixed element at the top edge; the see-through
 * scrim showed as a black bar. .sheet-status-bar paints this color, dimmed like the scrim.
 */
function colorAtTop() {
  for (let el = document.elementFromPoint(window.innerWidth / 2, 1); el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (color && color !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return getComputedStyle(document.body).backgroundColor;
}

/**
 * Bottom sheet. A native <dialog> handles focus, Escape and the inert page;
 * the panel slides on a critically damped spring and can be dragged down from
 * its handle or header to dismiss. Reduced motion is handled by MotionConfig.
 */
export default function Sheet({ open, onClose, title, description, children, footer }) {
  const dialogRef = useRef(null);
  const [mounted, setMounted] = useState(open);
  const dragControls = useDragControls();
  const titleId = useId();
  const descriptionId = useId();

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!mounted || !dialog || dialog.open) return;
    dialog.style.setProperty('--under', colorAtTop());
    dialog.showModal();
    // showModal() focuses the close button, and iPhone draws a focus ring on it.
    // Focus the sheet itself: screen readers start at its title, Tab still reaches ×.
    dialog.querySelector('.sheet-panel')?.focus({ preventScroll: true });
  }, [mounted]);

  const startDrag = (event) => dragControls.start(event);

  return (
    mounted && (
      <dialog
        ref={dialogRef}
        className="sheet-dialog on-day"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <AnimatePresence
          onExitComplete={() => {
            dialogRef.current?.close();
            setMounted(false);
          }}
        >
          {open && (
            // Opening, the dim rides the panel's spring. Closing, it fades faster than the
            // panel travels, so the page is clear before the sheet reaches the bottom.
            // The status-bar strip is part of it and fades with it.
            <motion.div
              key="scrim"
              className="sheet-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: CLEAR }}
              transition={SPRING}
              onClick={onClose}
            >
              <div className="sheet-status-bar" aria-hidden="true" />
            </motion.div>
          )}
          {open && (
            <motion.div
              key="panel"
              className="sheet-panel"
              tabIndex={-1}
              initial={{ y: '100%', boxShadow: SHADOW_OFF }}
              animate={{ y: 0, boxShadow: SHADOW }}
              // Its upward shadow fades with the dim, so no dark band lingers over the page.
              exit={{ y: '100%', boxShadow: SHADOW_OFF, transition: { y: SPRING, boxShadow: CLEAR } }}
              transition={SPRING}
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 1 }}
              onDragEnd={(event, info) => {
                if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) onClose();
              }}
            >
              <div className="sheet-handle" onPointerDown={startDrag} aria-hidden="true">
                <span />
              </div>
              <header className="sheet-header" onPointerDown={startDrag}>
                <div>
                  <h2 id={titleId} className="sheet-title">
                    {title}
                  </h2>
                  {description && (
                    <p id={descriptionId} className="sheet-description">
                      {description}
                    </p>
                  )}
                </div>
                <button type="button" className="pill pill--day pill--icon" onClick={onClose} aria-label="Close">
                  <Icon name="close" size={18} />
                </button>
              </header>
              <div className="sheet-body">{children}</div>
              {footer && <div className="sheet-footer">{footer}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </dialog>
    )
  );
}
