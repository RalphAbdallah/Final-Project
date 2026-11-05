/**
 * iPhone Safari colours its bottom toolbar from <meta name="theme-color"> (index.html).
 * It was always white, which suits light screens (white sheet at the bottom) but left a
 * white band under the toolbar on dark ones (Home, Landing, Share, loading and error
 * screens). This keeps it matched to the screen on show: white when there's a light
 * `.screen`, black otherwise. Rechecked whenever the page's content changes (a new
 * screen, a lazy page arriving), at most once a frame.
 */
const LIGHT = '#ffffff';
const DARK = '#070707'; // --night, oklch(0.13 0 0)

if (typeof document !== 'undefined') {
  const meta = document.querySelector('meta[name="theme-color"]');
  const root = document.getElementById('root');
  let queued = false;

  const update = () => {
    queued = false;
    const colour = document.querySelector('.screen') ? LIGHT : DARK;
    if (meta && meta.getAttribute('content') !== colour) meta.setAttribute('content', colour);
  };

  if (meta && root) {
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    }).observe(root, { childList: true, subtree: true });
    update();
  }
}
