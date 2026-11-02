/**
 * The payer's wallets as colored cards fanned in from the right edge of the
 * dark top. Only a sliver of each card shows, so they carry color, not text;
 * the caption beside them names the wallets. A button when `onClick` is given.
 */
export default function WalletStack({ wallets, onClick, label }) {
  if (wallets.length === 0) return null;
  const style = { '--count': wallets.length };
  const cards = wallets.map((id, i) => (
    <span key={id} className={`wallet-card wallet--${id}`} style={{ '--i': i }} />
  ));

  if (!onClick) {
    return (
      <span className="wallet-stack" style={style} aria-hidden="true">
        {cards}
      </span>
    );
  }
  return (
    <button type="button" className="wallet-stack" style={style} onClick={onClick} aria-label={label}>
      {cards}
    </button>
  );
}
