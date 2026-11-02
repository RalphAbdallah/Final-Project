import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="state on-night">
      <h1 className="state__title">This page doesn't exist</h1>
      <p className="state__text">If someone sent you a bill link, ask them to share it again.</p>
      <Link className="pill pill--night" to="/">
        Go to splIT
      </Link>
    </main>
  );
}
