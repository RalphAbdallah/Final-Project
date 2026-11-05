import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * Pages that stack like an iPhone app: going deeper (Home → Profile, Home → a bill,
 * a bill → Edit) slides the new page in from the right over the old one, which eases
 * back a little and dims; going back slides the top page off to the right. Runs as a
 * browser view transition (styles in styles/layout.css); where those aren't supported,
 * or with reduced motion, the page just changes. The phone's own swipe-back isn't
 * flagged, so it keeps the native animation.
 */
function setDirection(back) {
  document.documentElement.dataset.nav = back ? 'back' : 'forward';
}

/**
 * Back and forward (the browser's button, the phone's swipe). React Router replays a
 * page's view transition when going back to it, with whatever direction was set last,
 * so after an iPhone swipe-back (which Safari has already animated) the page slid in
 * again from the right. Now: if the browser animated it itself (`hasUAVisualTransition`;
 * a touch screen when the browser can't say), no second animation; otherwise a back slide.
 * Registered when this module loads, before the router's own listener (main.jsx).
 */
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (event) => {
    const animatedByBrowser =
      'hasUAVisualTransition' in event ? event.hasUAVisualTransition : window.matchMedia('(pointer: coarse)').matches;
    document.documentElement.dataset.nav = animatedByBrowser ? 'none' : 'back';
  });
}

/** A <Link> that stacks forward, or unstacks with `back`. */
export function StackLink({ back = false, onClick, ...props }) {
  return (
    <Link
      viewTransition
      onClick={(event) => {
        setDirection(back);
        onClick?.(event);
      }}
      {...props}
    />
  );
}

/** navigate(), stacking: `go(to, { back, replace, state })`. */
export function useStackNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to, { back = false, ...options } = {}) => {
      setDirection(back);
      navigate(to, { ...options, viewTransition: true });
    },
    [navigate],
  );
}
