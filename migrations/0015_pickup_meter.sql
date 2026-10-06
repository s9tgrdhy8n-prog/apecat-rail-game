-- Power-skull meter. Old pickups stay marked so only new ones fill it.
alter table rail_diamond add column if not exists pickup_mark integer not null default 0;
alter table rail_diamond add column if not exists pickup_paid integer not null default 0;

insert into rail_diamond (person_key, pickup_mark)
select person_key, coalesce(sum(shields + magnets + surges), 0)::int
from rail_play
group by person_key
on conflict (person_key) do update
set pickup_mark = excluded.pickup_mark
where rail_diamond.pickup_mark = 0
  and rail_diamond.pickup_paid = 0;
