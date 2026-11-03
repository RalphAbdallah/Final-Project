import { WALLETS } from '../lib/wallets.js';
import Icon from './Icon.jsx';

/** A wallet's app logo in a rounded tile (cash gets an icon). Decorative: the wallet's name is always next to it. */
export default function WalletLogo({ wallet, size = 40 }) {
  const style = { '--size': `${size}px` };
  if (wallet === 'cash') {
    return (
      <span className="wallet-logo wallet-logo--cash" style={style} aria-hidden="true">
        <Icon name="cash" size={Math.round(size * 0.45)} />
      </span>
    );
  }
  return (
    <span className={`wallet-logo wallet-logo--${wallet}`} style={style} aria-hidden="true">
      <img src={WALLETS[wallet].logo} alt="" width={size} height={size} />
    </span>
  );
}
