-- Time on the stats sheet is banked by the server while the run is moving.
alter table rail_open_run add column if not exists played double precision not null default 0;

alter table rail_play add column if not exists meters integer not null default 0;

-- Older named runs stored distance but left the clock at 0.
update rail_runs
set seconds = greatest(1, (meters / 24.0)::int)
where seconds = 0 and meters >= 8;

update rail_play p
set meters = r.meters,
    seconds = case when p.seconds = 0 then r.seconds else p.seconds end
from rail_runs r
where p.person_key = r.user_id
  and p.score = r.score
  and p.coins = r.coins
  and p.meters = 0;
