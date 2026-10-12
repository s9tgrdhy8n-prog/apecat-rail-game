-- One-time 169 Diamond Skull drop. The 24 hours start when this migration
-- runs on that database, which is publish time in production.
create table if not exists rail_reward_drop (
  id text primary key,
  ends_at timestamptz not null,
  skulls integer not null
);

insert into rail_reward_drop (id, ends_at, skulls)
values ('crystal-169', now() + interval '24 hours', 169)
on conflict (id) do nothing;

create table if not exists rail_reward_claim (
  user_id text primary key references rail_players (user_id),
  drop_id text not null references rail_reward_drop (id),
  claimed_at timestamptz not null default now()
);
