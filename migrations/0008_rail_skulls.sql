alter table rail_play add column if not exists shields integer not null default 0;
alter table rail_play add column if not exists magnets integer not null default 0;
alter table rail_play add column if not exists surges integer not null default 0;
