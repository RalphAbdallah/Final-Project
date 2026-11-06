-- Bills are created from one or more receipt photos (PRD M2, M3).
create table bill_photos (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills (id) on delete cascade,
  -- Object path in the private "receipts" storage bucket: <payer id>/<uuid>.jpg
  path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index bill_photos_bill_idx on bill_photos (bill_id, position);
alter table bill_photos enable row level security;

-- Replaced by bill_photos (one bill, several photos).
alter table bills drop column receipt_url;

-- The LBP rate printed on the receipt, if any (for USD/LBP later, N2).
alter table bills add column lbp_rate numeric(12, 2) check (lbp_rate > 0);
