-- Valorant IM Tracker schema. Paste into the Supabase SQL editor and run once.
-- Reads are public (anyone can view stats). All writes go through the Next.js
-- server using the service-role key, after it checks who is signed in.

create extension if not exists pgcrypto;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tag text,
  challonge_participant_id bigint unique,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  riot_name text not null,
  riot_tag text,                      -- the part after '#', optional
  team_id uuid references teams(id) on delete set null,
  is_captain boolean not null default false,
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (riot_name, riot_tag)
);

-- One row per signed-in user. Promote an admin with:
--   update profiles set is_admin = true where email = 'you@school.edu';
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  challonge_match_id bigint unique,
  round_label text,
  team_a_id uuid not null references teams(id) on delete cascade,
  team_b_id uuid not null references teams(id) on delete cascade,
  scheduled_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed')),
  winner_team_id uuid references teams(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists match_maps (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  map_number int not null default 1,
  map_name text,
  team_a_rounds int not null,
  team_b_rounds int not null,
  screenshot_path text,
  uploaded_by uuid references auth.users(id) on delete set null,
  played_at timestamptz not null default now(),
  unique (match_id, map_number)
);

create table if not exists player_map_stats (
  id uuid primary key default gen_random_uuid(),
  match_map_id uuid not null references match_maps(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  agent text,
  acs int,
  kills int not null default 0,
  deaths int not null default 0,
  assists int not null default 0,
  econ int,
  first_bloods int,
  plants int,
  defuses int,
  unique (match_map_id, player_id)
);

create index if not exists idx_pms_player on player_map_stats(player_id);
create index if not exists idx_maps_match on match_maps(match_id);
create index if not exists idx_players_team on players(team_id);

-- Every player's line on every map, with result and context.
create or replace view player_map_results with (security_invoker = true) as
select
  s.*,
  mm.match_id,
  mm.map_name,
  mm.map_number,
  mm.played_at,
  mm.team_a_rounds + mm.team_b_rounds as rounds,
  case when s.team_id = m.team_a_id then mm.team_a_rounds else mm.team_b_rounds end as rounds_won,
  case when s.team_id = m.team_a_id then mm.team_b_rounds else mm.team_a_rounds end as rounds_lost,
  case when s.team_id = m.team_a_id then mm.team_a_rounds > mm.team_b_rounds
       else mm.team_b_rounds > mm.team_a_rounds end as won,
  case when s.team_id = m.team_a_id then m.team_b_id else m.team_a_id end as opponent_team_id
from player_map_stats s
join match_maps mm on mm.id = s.match_map_id
join matches m on m.id = mm.match_id;

-- Career totals per player.
create or replace view player_career with (security_invoker = true) as
select
  p.id as player_id,
  p.riot_name,
  p.riot_tag,
  p.team_id,
  p.is_captain,
  count(r.id)::int as maps,
  (count(r.id) filter (where r.won))::int as wins,
  coalesce(sum(r.kills), 0)::int as kills,
  coalesce(sum(r.deaths), 0)::int as deaths,
  coalesce(sum(r.assists), 0)::int as assists,
  round(avg(r.acs))::int as avg_acs,
  round(sum(r.kills)::numeric / nullif(sum(r.deaths), 0), 2) as kd,
  coalesce(sum(r.first_bloods), 0)::int as first_bloods,
  coalesce(sum(r.plants), 0)::int as plants,
  coalesce(sum(r.defuses), 0)::int as defuses
from players p
left join player_map_results r on r.player_id = p.id
group by p.id;

-- Row level security: public read, no direct client writes.
alter table teams enable row level security;
alter table players enable row level security;
alter table profiles enable row level security;
alter table matches enable row level security;
alter table match_maps enable row level security;
alter table player_map_stats enable row level security;

drop policy if exists "public read" on teams;
create policy "public read" on teams for select using (true);
drop policy if exists "public read" on players;
create policy "public read" on players for select using (true);
drop policy if exists "public read" on matches;
create policy "public read" on matches for select using (true);
drop policy if exists "public read" on match_maps;
create policy "public read" on match_maps for select using (true);
drop policy if exists "public read" on player_map_stats;
create policy "public read" on player_map_stats for select using (true);
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for select using (auth.uid() = user_id);

-- Newer Supabase projects don't expose tables to the API until granted.
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;

-- Public bucket for scoreboard screenshots (uploads happen server-side).
insert into storage.buckets (id, name, public)
values ('scoreboards', 'scoreboards', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Ranked info (also in migrations/002_ranks.sql for existing projects)
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

-- ---------------------------------------------------------------------------
-- Subs (also in migrations/003_subs.sql): stat lines without a player profile
alter table player_map_stats alter column player_id drop not null;
alter table player_map_stats add column if not exists sub_name text;
alter table player_map_stats drop constraint if exists player_or_sub;
alter table player_map_stats add constraint player_or_sub
  check (player_id is not null or sub_name is not null);

-- ---------------------------------------------------------------------------
-- Profile claiming (also in migrations/004_claims.sql)
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
