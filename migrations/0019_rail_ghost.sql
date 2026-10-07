create table if not exists rail_ghost (
  user_id text primary key references rail_players (user_id),
  seed integer not null,
  runner text not null,
  tape text not null,
  score integer not null,
  updated_at timestamptz not null default now()
);
