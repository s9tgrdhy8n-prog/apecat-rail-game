-- One live run per browser. Score posts have to grow inside this row.
create table if not exists rail_open_run (
  person_key text primary key,
  started_at timestamptz not null default now(),
  touched_at timestamptz not null default now(),
  meters     integer not null default 0,
  coins      integer not null default 0
);
