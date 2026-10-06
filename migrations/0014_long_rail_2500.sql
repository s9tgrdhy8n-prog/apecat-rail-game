-- Long rail is 2,500 meters. Pay today's 2 skulls once to anyone who already
-- reached that in one watched run since 1.1.0 went live (2026-10-05 18:36:50 UTC).
with earned as (
  insert into rail_goal_pay (person_key, period_key, goal_id, skulls)
  select person_key, '2026-10-05', 'day-rail', 2
  from rail_play
  where meters >= 2500
    and seconds >= 1
    and seconds <= (meters / 12.0) + 90
    and created_at >= timestamptz '2026-10-05 18:36:50+00'
    and created_at < timestamptz '2026-10-06 00:00:00+00'
  group by person_key
  on conflict (person_key, period_key, goal_id) do nothing
  returning person_key, skulls
)
insert into rail_diamond (person_key, skulls)
select person_key, skulls from earned
on conflict (person_key) do update
set skulls = rail_diamond.skulls + excluded.skulls;
