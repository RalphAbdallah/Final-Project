const LABELS = { unpaid: 'Unpaid', marked_paid: 'Marked as paid', confirmed: 'Confirmed' };

export default function StatusChip({ status }) {
  return (
    <span className={`chip chip--${status}`}>
      <span className="chip__dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
