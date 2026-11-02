import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

/** `const [toast, showToast] = useToast()`: render `toast`, call `showToast(text)`. */
export function useToast() {
  const [message, setMessage] = useState(null);
  const timer = useRef(null);

  const show = useCallback((text) => {
    setMessage({ text, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3600);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const node = (
    <div className="toast-region" role="status" aria-live="polite">
      <AnimatePresence>
        {message && (
          <motion.div
            key={message.id}
            className="toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
  return [node, show];
}
