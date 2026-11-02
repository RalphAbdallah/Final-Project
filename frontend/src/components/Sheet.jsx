import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const SPRING = { type: 'spring', bounce: 0, duration: 0.4 };
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 600;

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
    if (mounted && dialog && !dialog.open) dialog.showModal();
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
            <motion.div
              key="scrim"
              className="sheet-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={onClose}
            />
          )}
          {open && (
            <motion.div
              key="panel"
              className="sheet-panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={SPRING}
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.04, bottom: 1 }}
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
