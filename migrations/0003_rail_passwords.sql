-- A password lets the same person open their name on another browser.
alter table rail_players add column if not exists password_hash text;
alter table rail_players add column if not exists password_salt text;

create table if not exists rail_devices (
  token_hash text primary key,
  user_id    text not null references rail_players (user_id),
  created_at timestamptz not null default now()
);

-- Names claimed before passwords used the token hash as user_id.
insert into rail_devices (token_hash, user_id)
select user_id, user_id from rail_players
on conflict (token_hash) do nothing;
