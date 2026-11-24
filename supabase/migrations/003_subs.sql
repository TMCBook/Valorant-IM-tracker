-- Keep subs' lines on match scoreboards without giving them player profiles.
-- A sub's stat line has no player_id, just the name read from the screenshot.
-- Run once in the SQL Editor (source: Database). Safe to run again.

alter table player_map_stats alter column player_id drop not null;
alter table player_map_stats add column if not exists sub_name text;

alter table player_map_stats drop constraint if exists player_or_sub;
alter table player_map_stats add constraint player_or_sub
  check (player_id is not null or sub_name is not null);
