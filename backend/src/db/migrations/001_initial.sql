-- splIT schema (PRD §10). Money columns are bigint in minor units: cents for USD, whole pounds for LBP.

-- Payers only. The id is the Supabase auth user id.
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  email text not null,
  created_at timestamptz not null default now()
);

-- Where a payer receives money: the link read from each wallet's receive-money QR code (PRD M1).
create table payout_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  wallet text not null check (wallet in ('whish', 'omt', 'neo', 'suyool')),
  pay_url text not null check (char_length(pay_url) <= 2048),
  created_at timestamptz not null default now(),
  unique (user_id, wallet)
);

create table bills (
  id uuid primary key default gen_random_uuid(),
  payer_id uuid not null references users (id) on delete cascade,
  venue text not null check (char_length(venue) between 1 and 80),
  date date not null default current_date,
  currency text not null default 'USD' check (currency in ('USD', 'LBP')),
  tax bigint not null default 0 check (tax >= 0),
  tax_rate numeric(5, 2) check (tax_rate >= 0),
  tax_included boolean not null default false,
  service bigint not null default 0 check (service >= 0),
  receipt_url text,
  share_token text not null unique,
  card_paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index bills_payer_idx on bills (payer_id, created_at desc);

create table items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  price bigint not null check (price >= 0),
  quantity integer not null default 1 check (quantity between 1 and 999),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index items_bill_idx on items (bill_id, position);

-- Everyone at the table, including the payer (is_payer). Guests have no account, only a guest token.
create table bill_members (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  is_payer boolean not null default false,
  guest_token text unique,
  status text not null default 'unpaid' check (status in ('unpaid', 'marked_paid', 'confirmed')),
  method text check (method in ('cash', 'whish', 'omt', 'neo', 'suyool')),
  tip bigint not null default 0 check (tip >= 0),
  paid_amount bigint check (paid_amount >= 0),
  proof_url text,
  marked_paid_at timestamptz,
  confirmed_at timestamptz,
  -- Join order breaks rounding ties in the split (PRD §8).
  seq bigint generated always as identity,
  created_at timestamptz not null default now(),
  check (is_payer or guest_token is not null)
);

create index bill_members_bill_idx on bill_members (bill_id, seq);
create unique index bill_members_name_idx on bill_members (bill_id, lower(name));
create unique index bill_members_one_payer_idx on bill_members (bill_id) where is_payer;

create table item_claims (
  item_id uuid not null references items (id) on delete cascade,
  member_id uuid not null references bill_members (id) on delete cascade,
  units integer not null default 1 check (units between 1 and 999),
  created_at timestamptz not null default now(),
  primary key (item_id, member_id)
);

create index item_claims_member_idx on item_claims (member_id);

-- The browser only talks to our Express API. Row level security with no policies
-- blocks Supabase's public API (anon and authenticated keys) from every table;
-- the backend connects as the database owner and is unaffected.
alter table users enable row level security;
alter table payout_methods enable row level security;
alter table bills enable row level security;
alter table items enable row level security;
alter table bill_members enable row level security;
alter table item_claims enable row level security;
