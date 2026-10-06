alter table rail_runs add column if not exists seconds integer not null default 0;

update rail_runs
set seconds = greatest(1, (meters / 24.0)::int)
where seconds = 0 and meters > 0;

create table if not exists rail_play (
  id         bigserial primary key,
  person_key text not null,
  runner     text not null,
  seconds    integer not null check (seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists rail_play_person_idx on rail_play (person_key);

insert into rail_play (person_key, runner, seconds, created_at)
select r.user_id,
       case when r.runner = 'BOGGO' then 'BOGGY' else r.runner end,
       r.seconds,
       r.created_at
from rail_runs r
where not exists (select 1 from rail_play);
