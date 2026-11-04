// The payer marks people paid (PRD §9), so "confirmed" reads simply as Paid.
// marked_paid only remains on bills from before that change.
const LABELS = { unpaid: 'Unpaid', marked_paid: 'Marked as paid', confirmed: 'Paid' };

/** A payment status: a rounded chip with the word (the word carries it, not the color alone). */
export default function StatusChip({ status }) {
  return <span className={`chip chip--status chip--${status}`}>{LABELS[status]}</span>;
}
