-- Rail names are claimed once. Scores stay forever.
create table if not exists rail_players (
  user_id    text primary key,
  name       text not null,
  name_key   text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists rail_runs (
  id         bigserial primary key,
  user_id    text not null references rail_players (user_id),
  score      integer not null check (score >= 0),
  meters     integer not null check (meters >= 0),
  coins      integer not null check (coins >= 0),
  runner     text not null,
  created_at timestamptz not null default now()
);

create index if not exists rail_runs_user_idx on rail_runs (user_id);
create index if not exists rail_runs_score_idx on rail_runs (score desc);
