-- Pickups banked while a run is open. The finished row uses these counts.
alter table rail_open_run add column if not exists shields integer not null default 0;
alter table rail_open_run add column if not exists magnets integer not null default 0;
alter table rail_open_run add column if not exists surges integer not null default 0;

-- One payout per goal per period. The client cannot insert this.
create table if not exists rail_goal_pay (
  person_key text not null,
  period_key text not null,
  goal_id text not null,
  skulls integer not null,
  primary key (person_key, period_key, goal_id)
);

-- Balances written by the browser before payouts were checked do not count.
update rail_diamond set skulls = 0, pinky = 0, koko = 0;
