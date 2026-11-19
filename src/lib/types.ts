export type Team = {
  id: string;
  name: string;
  tag: string | null;
  challonge_participant_id: number | null;
};

export type Player = {
  id: string;
  riot_name: string;
  riot_tag: string | null;
  team_id: string | null;
  is_captain: boolean;
  user_id: string | null;
};

export type Match = {
  id: string;
  challonge_match_id: number | null;
  round_label: string | null;
  team_a_id: string;
  team_b_id: string;
  scheduled_at: string | null;
  status: "scheduled" | "completed";
  winner_team_id: string | null;
  created_at: string;
};

export type MatchMap = {
  id: string;
  match_id: string;
  map_number: number;
  map_name: string | null;
  team_a_rounds: number;
  team_b_rounds: number;
  screenshot_path: string | null;
  played_at: string;
};

export type StatLine = {
  id: string;
  match_map_id: string;
  player_id: string;
  team_id: string;
  agent: string | null;
  acs: number | null;
  kills: number;
  deaths: number;
  assists: number;
  econ: number | null;
  first_bloods: number | null;
  plants: number | null;
  defuses: number | null;
};

export type MapResult = StatLine & {
  match_id: string;
  map_name: string | null;
  map_number: number;
  played_at: string;
  rounds: number;
  rounds_won: number;
  rounds_lost: number;
  won: boolean;
  opponent_team_id: string;
};

export type Career = {
  player_id: string;
  riot_name: string;
  riot_tag: string | null;
  team_id: string | null;
  is_captain: boolean;
  maps: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avg_acs: number | null;
  kd: number | null;
  first_bloods: number;
  plants: number;
  defuses: number;
};

export function riotId(p: { riot_name: string; riot_tag: string | null }) {
  return p.riot_tag ? `${p.riot_name}#${p.riot_tag}` : p.riot_name;
}
