import { useCallback, useEffect, useState } from 'react';

const SHOWN_FOR = 3600; // ms
const LEAVE_TIME = 220; // ms, the slide-away animation in layout.css

/**
 * A short message that pops up above the bottom bar, then goes away by itself.
 * Use: const [toast, showToast] = useToast(); put {toast} on the page; call showToast('Saved.').
 */
export function useToast() {
  const [message, setMessage] = useState(null); // { text, id, leaving }

  // useCallback keeps showToast the same function between renders (Session 20).
  const showToast = useCallback((text) => setMessage({ text, id: Date.now(), leaving: false }), []);

  // Each new message: start leaving after a while, then disappear (setTimeout, Session 10).
  const messageId = message ? message.id : null;
  useEffect(() => {
    if (messageId === null) return;
    const leave = setTimeout(() => setMessage((m) => ({ ...m, leaving: true })), SHOWN_FOR);
    const remove = setTimeout(() => setMessage(null), SHOWN_FOR + LEAVE_TIME);
    return () => {
      clearTimeout(leave);
      clearTimeout(remove);
    };
  }, [messageId]);

  const node = (
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        // A new key restarts the pop-in animation for each new message.
        <div key={message.id} className={`toast${message.leaving ? ' is-leaving' : ''}`}>
          {message.text}
        </div>
      )}
    </div>
  );
  return [node, showToast];
}
