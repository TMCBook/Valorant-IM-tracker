-- Profile claiming. Run once in the SQL Editor (source: Database). Safe to run again.

-- Discord username from the season sign-up sheet. A signed-in user whose
-- Discord matches can claim this profile instantly; others need an admin.
alter table players add column if not exists discord text;

create table if not exists player_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  discord text,                      -- the claimer's Discord username, for the admin to compare
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- One open claim per user at a time.
create unique index if not exists player_claims_one_pending
  on player_claims (user_id) where status = 'pending';

-- Claims are private: only the server (service role) reads and writes them.
alter table player_claims enable row level security;
grant all on player_claims to service_role;
