/**
 * The loading screen for screens that have no skeleton of their own (app start, Home,
 * Profile, Get paid, a page's code arriving): a lime ring that spins on the dark page.
 * It fades in after a short delay, so quick loads never flash a spinner. Screens that
 * know their layout keep their skeletons instead.
 */
export function Spinner({ size = 36 }) {
  return <span className="spinner" style={{ '--spinner-size': `${size}px` }} aria-hidden="true" />;
}

export default function LoadingScreen({ label = 'Loading' }) {
  return (
    <main className="state on-night" aria-busy="true" aria-label={label}>
      <Spinner />
    </main>
  );
}
