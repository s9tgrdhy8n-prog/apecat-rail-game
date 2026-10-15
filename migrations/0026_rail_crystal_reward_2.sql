-- Second 169 Diamond Skull drop. The 24 hours start when this migration
-- runs on that database, which is publish time in production.
-- People who already claimed crystal-169 can claim this one too.
alter table rail_reward_claim drop constraint if exists rail_reward_claim_pkey;
alter table rail_reward_claim add primary key (user_id, drop_id);

insert into rail_reward_drop (id, ends_at, skulls)
values ('crystal-169-2', now() + interval '24 hours', 169)
on conflict (id) do nothing;
