-- Seasons. Run once in the SQL Editor (source: Database). Safe to run again.
--
-- Teams, matches and rosters belong to a season. Players (and their profiles,
-- claims, ranks and Discord) carry over between seasons. Everything that exists
-- today is put into FA26, which becomes the current season.

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                 -- e.g. FA26, SP27
  is_current boolean not null default false,
  started_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists seasons_one_current on seasons (is_current) where is_current;

alter table teams add column if not exists season_id uuid references seasons(id);
alter table teams add column if not exists group_name text;          -- "Group A", from the sign-up sheet
alter table matches add column if not exists season_id uuid references seasons(id);

-- Who played for which team in each season (players.team_id = current season only).
create table if not exists season_rosters (
  season_id uuid not null references seasons(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  is_captain boolean not null default false,
  primary key (season_id, player_id)
);

-- ---- Put existing data into FA26 ----
insert into seasons (name, is_current) values ('FA26', true) on conflict (name) do nothing;
update teams set season_id = (select id from seasons where name = 'FA26') where season_id is null;
update matches set season_id = (select id from seasons where name = 'FA26') where season_id is null;
insert into season_rosters (season_id, player_id, team_id, is_captain)
  select s.id, p.id, p.team_id, p.is_captain from players p, seasons s
  where s.name = 'FA26' and p.team_id is not null
on conflict (season_id, player_id) do nothing;

-- Team names repeat across seasons ("Rogue" in FA26 and SP27); unique within one season.
alter table teams drop constraint if exists teams_name_key;
create unique index if not exists teams_season_name on teams (season_id, name);

-- ---- Views ----
-- Rebuilt from scratch: player_map_stats gained columns (sub_name) since these
-- views were made, so they can't be altered in place.
drop view if exists player_season_career;
drop view if exists player_career;
drop view if exists player_map_results;

-- Every map line, with its result, opponent and season.
create view player_map_results with (security_invoker = true) as
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
  case when s.team_id = m.team_a_id then m.team_b_id else m.team_a_id end as opponent_team_id,
  m.season_id
from player_map_stats s
join match_maps mm on mm.id = s.match_map_id
join matches m on m.id = mm.match_id;

-- All-time totals per player (unchanged, recreated because it depends on the view above).
create view player_career with (security_invoker = true) as
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

-- One row per player per season they were rostered in (same columns as player_career + season_id).
create view player_season_career with (security_invoker = true) as
select
  p.id as player_id,
  p.riot_name,
  p.riot_tag,
  sr.team_id,
  sr.is_captain,
  sr.season_id,
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
from season_rosters sr
join players p on p.id = sr.player_id
left join player_map_results r on r.player_id = p.id and r.season_id = sr.season_id
group by p.id, sr.season_id, sr.team_id, sr.is_captain;

-- ---- Access: public read, server-only writes ----
alter table seasons enable row level security;
alter table season_rosters enable row level security;
drop policy if exists "public read" on seasons;
create policy "public read" on seasons for select using (true);
drop policy if exists "public read" on season_rosters;
create policy "public read" on season_rosters for select using (true);
grant select on seasons, season_rosters, player_season_career, player_map_results, player_career to anon, authenticated;
grant all on seasons, season_rosters to service_role;
grant select on player_season_career, player_map_results, player_career to service_role;
