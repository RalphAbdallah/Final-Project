import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

// Each sheet on the page gets its own ids (for the dialog, title and description).
let sheetCount = 0;

// Dragged down further than this, or flicked down faster than this, closes the sheet.
const CLOSE_DISTANCE = 120; // px
const CLOSE_SPEED = 0.6; // px per ms

/**
 * The background color at the top of the screen, under the status bar. iPhone Safari
 * colors its status bar from the fixed element at the top edge, and the see-through
 * dim showed as a black bar. .sheet-status-bar paints this color, dimmed like the page.
 */
function colorAtTop() {
  for (let el = document.elementFromPoint(window.innerWidth / 2, 1); el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (color && color !== 'transparent' && !color.endsWith(', 0)')) return color;
  }
  return getComputedStyle(document.body).backgroundColor;
}

/**
 * Bottom sheet. A native <dialog> handles focus, Escape and the page behind.
 * It slides up with a CSS animation (components.css), slides down when closed,
 * and can be dragged down from its handle or header to close.
 */
export default function Sheet({ open, onClose, title, description, children, footer }) {
  const [id] = useState(() => {
    sheetCount += 1;
    return `sheet-${sheetCount}`;
  });
  const [mounted, setMounted] = useState(false); // on the page (open, or sliding away)
  const [closing, setClosing] = useState(false); // sliding away
  // While a finger drags the sheet: where it started, how far it is, how fast it moves.
  const [drag, setDrag] = useState(null);

  // open -> put it on the page; closed -> slide it away first (finish() removes it).
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else {
      setClosing(true);
    }
  }, [open]);

  // Once it's on the page: open the dialog and focus the sheet (screen readers start at its title).
  useEffect(() => {
    if (!mounted) return;
    const dialog = document.getElementById(id);
    if (dialog.open) return;
    dialog.style.setProperty('--under', colorAtTop());
    dialog.showModal();
    dialog.querySelector('.sheet-panel').focus({ preventScroll: true });
  }, [mounted, id]);

  // While open, a finger drag scrolls nothing: not the page behind (iPhone ignores
  // overflow: hidden on it) and not the sheet, unless its content is taller than the sheet.
  useEffect(() => {
    if (!mounted) return;
    function block(event) {
      const body = event.target.closest('.sheet-body');
      if (body && body.scrollHeight > body.clientHeight + 1) return;
      event.preventDefault();
    }
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, [mounted]);

  // The slide-away animation ended: close the dialog and take the sheet off the page.
  function finish(event) {
    if (event.target !== event.currentTarget || !closing) return;
    document.getElementById(id).close();
    setMounted(false);
    setClosing(false);
    setDrag(null);
  }

  // Dragging: pointer events work like click events, for a finger or a mouse.
  function startDrag(event) {
    if (event.target.closest('button')) return; // the × button is a button, not a handle
    event.currentTarget.setPointerCapture(event.pointerId); // keep getting moves outside the header
    setDrag({ active: true, startY: event.clientY, offset: 0, lastY: event.clientY, lastTime: event.timeStamp, speed: 0 });
  }

  function moveDrag(event) {
    if (!drag || !drag.active) return;
    const time = Math.max(1, event.timeStamp - drag.lastTime);
    setDrag({
      ...drag,
      offset: Math.max(0, event.clientY - drag.startY), // down only
      speed: (event.clientY - drag.lastY) / time,
      lastY: event.clientY,
      lastTime: event.timeStamp,
    });
  }

  function endDrag() {
    if (!drag || !drag.active) return;
    if (drag.offset > CLOSE_DISTANCE || drag.speed > CLOSE_SPEED) {
      // Keep it where the finger left it; the slide-away starts from there.
      setDrag({ ...drag, active: false });
      onClose();
    } else {
      setDrag(null); // springs back up (the CSS transition)
    }
  }

  if (!mounted) return null;

  const dragHandlers = { onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag };
  let panelClass = 'sheet-panel';
  if (closing) panelClass += ' is-closing';
  if (drag && drag.active) panelClass += ' is-dragging';

  return (
    <dialog
      id={id}
      className={`sheet-dialog on-day${closing ? ' is-closing' : ''}`}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault(); // Escape: slide away like the other ways of closing
        onClose();
      }}
    >
      <div className="sheet-scrim" onClick={onClose}>
        <div className="sheet-status-bar" aria-hidden="true" />
      </div>
      <div
        className={panelClass}
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag.offset}px)` } : undefined}
        onAnimationEnd={finish}
      >
        <div className="sheet-handle" aria-hidden="true" {...dragHandlers}>
          <span />
        </div>
        <header className="sheet-header" {...dragHandlers}>
          <div>
            <h2 id={`${id}-title`} className="sheet-title">
              {title}
            </h2>
            {description && (
              <p id={`${id}-description`} className="sheet-description">
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
      </div>
    </dialog>
  );
}
