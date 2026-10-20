-- Third 169 Diamond Skull drop. The 48 hours start when this migration
-- runs on that database, which is publish time in production.
-- People who already claimed crystal-169 or crystal-169-2 can claim this one too.
-- Accounts created during the window can claim it once.
insert into rail_reward_drop (id, ends_at, skulls)
values ('crystal-169-3', now() + interval '48 hours', 169)
on conflict (id) do nothing;
