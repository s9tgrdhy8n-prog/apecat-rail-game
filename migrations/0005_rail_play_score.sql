alter table rail_play add column if not exists score integer not null default 0;
alter table rail_play add column if not exists coins integer not null default 0;

update rail_play p
set score = r.score,
    coins = r.coins
from rail_runs r
where p.person_key = r.user_id
  and p.created_at = r.created_at
  and p.runner = case when r.runner = 'BOGGO' then 'BOGGY' else r.runner end
  and p.score = 0
  and p.coins = 0;
