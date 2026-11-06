-- Every receipt read that reached OpenAI, with the tokens it cost.
-- Used to rate-limit reading per payer and overall, so nobody can drain the AI credit.
create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  photos integer not null check (photos >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  ms integer not null check (ms >= 0),
  ok boolean not null,
  created_at timestamptz not null default now()
);

create index ai_usage_user_idx on ai_usage (user_id, created_at desc);
create index ai_usage_created_idx on ai_usage (created_at desc);
alter table ai_usage enable row level security;
