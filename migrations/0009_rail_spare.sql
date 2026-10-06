-- Clock slack for one live run. A slightly early check-in can spend it.
alter table rail_open_run add column if not exists spare integer not null default 360;
