-- Ranked info from HenrikDev, cached per player. Run once in the SQL Editor
-- (source: Database). Safe to run again.

alter table players add column if not exists puuid text;

create table if not exists player_ranks (
  player_id uuid primary key references players(id) on delete cascade,
  status text not null default 'ok' check (status in ('ok', 'not_found', 'unranked', 'error')),
  error text,
  current_tier text,
  current_tier_id int,
  current_rr int,
  peak_tier text,
  peak_tier_id int,
  peak_rr int,
  peak_season text,
  fetched_at timestamptz not null default now()
);

alter table player_ranks enable row level security;
drop policy if exists "public read" on player_ranks;
create policy "public read" on player_ranks for select using (true);
grant select on player_ranks to anon, authenticated;
grant all on player_ranks to service_role;
