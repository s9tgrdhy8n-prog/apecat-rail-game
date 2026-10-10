import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { emptyTally, goalDone, GOALS, utcDay, utcWeek, type Tally } from "@/game/achievements";
import { decodeGhost, type GhostTape } from "@/game/replay";
import { RUN_SPARE, SPEED_CAP, TICK_WINDOW_SEC, activeSeconds, fitWatchedRun, maxCoinsFor, metersGranted, scoreFits, scoreWithinTime, spareAfter } from "@/game/run-guard";

export type BoardRow = {
  rank: number | null;
  name: string;
  score: number;
  meters: number;
  coins: number;
  runner: string;
  you: boolean;
  ghost: boolean;
};

export type BoardState = {
  name: string | null;
  hasPassword: boolean;
  rows: BoardRow[];
  you: BoardRow | null;
};

const NAME_RE = /^[A-Za-z0-9_]+(?: [A-Za-z0-9_]+)*$/;
const TOKEN_RE = /^[a-f0-9]{64}$/;
const PBKDF2_ITERS = 100_000;

type Result = { ok: true; name: string } | { ok: false; error: string };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function randomHex(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bytesToHex(buffer);
}

async function tokenHash(token: string): Promise<string | null> {
  if (!TOKEN_RE.test(token)) return null;
  return sha256Hex(token);
}

function cleanName(raw: string) {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 16 || !NAME_RE.test(name)) return null;
  return name;
}

function cleanPassword(raw: string) {
  if (raw.length < 6 || raw.length > 64) return null;
  return raw;
}

function isMine(value: unknown) {
  return value === true || value === "t" || value === "true";
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hashPassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

type BestRow = {
  name: string;
  created_at: string;
  score: number;
  meters: number;
  coins: number;
  runner: string;
  mine: boolean;
  ghost: boolean;
};

type PlayerRow = { user_id: string; name: string; has_password: boolean };

async function resolveUser(token: string): Promise<PlayerRow | null> {
  const hash = await tokenHash(token);
  if (!hash) return null;
  const sql = await getSql();
  const linked = await sql<PlayerRow>`
    select p.user_id, p.name, (p.password_hash is not null) as has_password
    from rail_devices d
    join rail_players p on p.user_id = d.user_id
    where d.token_hash = ${hash}
  `;
  if (linked[0]) return linked[0];
  const legacy = await sql<PlayerRow>`
    select user_id, name, (password_hash is not null) as has_password
    from rail_players
    where user_id = ${hash}
  `;
  if (!legacy[0]) return null;
  await sql`
    insert into rail_devices (token_hash, user_id)
    values (${hash}, ${legacy[0].user_id})
    on conflict (token_hash) do nothing
  `;
  return legacy[0];
}

async function bindDevice(token: string, userId: string) {
  const hash = await tokenHash(token);
  if (!hash) return;
  const sql = await getSql();
  await sql`
    insert into rail_devices (token_hash, user_id)
    values (${hash}, ${userId})
    on conflict (token_hash) do update set user_id = excluded.user_id
  `;
}

async function loadBoard(userId: string): Promise<BoardState> {
  const sql = await getSql();
  const mine = await sql<{ name: string; has_password: boolean }>`
    select name, (password_hash is not null) as has_password
    from rail_players
    where user_id = ${userId}
  `;
  const bests = await sql<BestRow>`
    select p.name,
           p.created_at::text as created_at,
           coalesce(max(r.score), 0)::int as score,
           coalesce((array_agg(r.meters order by r.score desc, r.id desc))[1], 0)::int as meters,
           coalesce((array_agg(r.coins order by r.score desc, r.id desc))[1], 0)::int as coins,
           coalesce((array_agg(r.runner order by r.score desc, r.id desc))[1], '') as runner,
           bool_or(p.user_id = ${userId}) as mine,
           (g.user_id is not null) as ghost
    from rail_players p
    left join rail_runs r on r.user_id = p.user_id
    left join rail_ghost g on g.user_id = p.user_id
    group by p.user_id, p.name, p.created_at, g.user_id
    order by score desc, p.created_at asc
  `;
  const ranked = bests.filter((row) => row.score > 0);
  const rows: BoardRow[] = ranked.slice(0, 30).map((row, index) => ({
    rank: index + 1,
    name: row.name,
    score: row.score,
    meters: row.meters,
    coins: row.coins,
    runner: row.runner,
    you: isMine(row.mine),
    ghost: isMine(row.ghost),
  }));
  const youIndex = ranked.findIndex((row) => isMine(row.mine));
  const mineRow = bests.find((row) => isMine(row.mine));
  const you = mineRow
    ? {
        rank: youIndex < 0 ? null : youIndex + 1,
        name: mineRow.name,
        score: mineRow.score,
        meters: mineRow.meters,
        coins: mineRow.coins,
        runner: mineRow.runner,
        you: true,
        ghost: isMine(mineRow.ghost),
      }
    : null;
  return {
    name: mine[0]?.name ?? null,
    hasPassword: isMine(mine[0]?.has_password),
    rows,
    you,
  };
}

async function boardForToken(token: string) {
  const user = await resolveUser(token);
  return loadBoard(user?.user_id ?? "");
}

function readSecret(raw: { token?: string; name?: string; password?: string } | undefined) {
  return {
    token: typeof raw?.token === "string" ? raw.token : "",
    name: typeof raw?.name === "string" ? raw.name : "",
    password: typeof raw?.password === "string" ? raw.password : "",
  };
}

export const getBoard = createServerFn({ method: "POST" })
  .validator((raw: { token?: string } | undefined) => (typeof raw?.token === "string" ? raw.token : ""))
  .handler(async ({ data: token }) => boardForToken(token));

export const claimName = createServerFn({ method: "POST" })
  .validator(readSecret)
  .handler(async ({ data }): Promise<Result> => {
    if (!(await tokenHash(data.token))) {
      return { ok: false, error: "This browser blocked saving the name. Allow site data and try again." };
    }
    const name = cleanName(data.name);
    if (!name) return { ok: false, error: "Use 3–16 letters, numbers, spaces, or underscores." };
    const password = cleanPassword(data.password);
    if (!password) return { ok: false, error: "Use a password of 6–64 characters." };
    const existing = await resolveUser(data.token);
    if (existing) return { ok: true, name: existing.name };
    const sql = await getSql();
    const taken = await sql<{ name: string }>`
      select name from rail_players where name_key = ${name.toLowerCase()}
    `;
    if (taken[0]) return { ok: false, error: "That name is already on the rail. Log in with its password." };
    const userId = randomHex(32);
    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    const device = await tokenHash(data.token);
    try {
      await sql`
        with player as (
          insert into rail_players (user_id, name, name_key, password_hash, password_salt)
          values (${userId}, ${name}, ${name.toLowerCase()}, ${hash}, ${salt})
          returning user_id
        )
        insert into rail_devices (token_hash, user_id)
        select ${device}, user_id from player
      `;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return { ok: false, error: "That name is already on the rail. Log in with its password." };
      throw err;
    }
    const deviceHash = await tokenHash(data.token);
    if (deviceHash) await absorbGuest(deviceHash, userId);
    return { ok: true, name };
  });

export const loginName = createServerFn({ method: "POST" })
  .validator(readSecret)
  .handler(async ({ data }): Promise<Result> => {
    if (!(await tokenHash(data.token))) {
      return { ok: false, error: "This browser blocked saving the name. Allow site data and try again." };
    }
    const name = cleanName(data.name);
    if (!name) return { ok: false, error: "Use 3–16 letters, numbers, spaces, or underscores." };
    const password = cleanPassword(data.password);
    if (!password) return { ok: false, error: "Wrong password." };
    const sql = await getSql();
    const rows = await sql<{ user_id: string; name: string; password_hash: string | null; password_salt: string | null }>`
      select user_id, name, password_hash, password_salt
      from rail_players
      where name_key = ${name.toLowerCase()}
    `;
    const player = rows[0];
    if (!player) return { ok: false, error: "No one rides under that name yet." };
    if (!player.password_hash || !player.password_salt) {
      return { ok: false, error: "That name has no password yet. Add one on the browser that claimed it." };
    }
    const hash = await hashPassword(password, player.password_salt);
    if (!safeEqual(hash, player.password_hash)) return { ok: false, error: "Wrong password." };
    await bindDevice(data.token, player.user_id);
    const deviceHash = await tokenHash(data.token);
    if (deviceHash) await absorbGuest(deviceHash, player.user_id);
    return { ok: true, name: player.name };
  });

export const setPassword = createServerFn({ method: "POST" })
  .validator((raw: { token?: string; password?: string } | undefined) => ({
    token: typeof raw?.token === "string" ? raw.token : "",
    password: typeof raw?.password === "string" ? raw.password : "",
  }))
  .handler(async ({ data }): Promise<Result> => {
    const user = await resolveUser(data.token);
    if (!user) return { ok: false, error: "Claim a name first." };
    if (isMine(user.has_password)) return { ok: false, error: "This name already has a password." };
    const password = cleanPassword(data.password);
    if (!password) return { ok: false, error: "Use a password of 6–64 characters." };
    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    const sql = await getSql();
    const updated = await sql<{ name: string }>`
      update rail_players
      set password_hash = ${hash}, password_salt = ${salt}
      where user_id = ${user.user_id} and password_hash is null
      returning name
    `;
    if (!updated[0]) return { ok: false, error: "This name already has a password." };
    return { ok: true, name: updated[0].name };
  });

function cleanRunner(raw: string | undefined) {
  if (raw === "GIMBO") return "GIMBO";
  if (raw === "BOGGY" || raw === "BOGGO") return "BOGGY";
  if (raw === "PINKY") return "PINKY";
  if (raw === "KOKO") return "KOKO";
  if (raw === "SPOOKY") return "SPOOKY";
  if (raw === "RAMDAWG") return "RAMDAWG";
  if (raw === "OTTER") return "OTTER";
  if (raw === "FIGGE") return "FIGGE";
  if (raw === "THEHODLR") return "THEHODLR";
  if (raw === "AFTERAPE") return "AFTERAPE";
  if (raw === "DEADBEAVER") return "DEADBEAVER";
  if (raw === "QUIT") return "QUIT";
  if (raw === "DUPES") return "DUPES";
  if (raw === "BOGGYBOND") return "BOGGYBOND";
  if (raw === "GIGATRON") return "GIGATRON";
  return "APECAT";
}

function cleanSeconds(raw: unknown) {
  return Math.max(0, Math.min(21_600, Math.floor(Number(raw) || 0)));
}

const RUNNER_ORDER = ["APECAT", "BOGGY", "GIMBO", "PINKY", "KOKO", "SPOOKY", "RAMDAWG", "OTTER", "FIGGE", "THEHODLR", "AFTERAPE", "DEADBEAVER", "QUIT", "DUPES", "BOGGYBOND", "GIGATRON"] as const;

export type PlaySlice = {
  seconds: number;
  runners: { name: (typeof RUNNER_ORDER)[number]; seconds: number }[];
};

export type SkullCounts = { shield: number; magnet: number; surge: number };

export const EMPTY_SKULLS: SkullCounts = { shield: 0, magnet: 0, surge: 0 };

export type RailStats = {
  global: PlaySlice & { players: number; coins: number; skulls: SkullCounts; diamonds: number };
  personal: PlaySlice & { best: number; coins: number; rank: number | null; skulls: SkullCounts; diamonds: number };
};

function sliceFrom(rows: { runner: string; seconds: number }[], seconds: number): PlaySlice {
  const byName = new Map(rows.map((row) => [row.runner, Number(row.seconds) || 0]));
  return {
    seconds,
    runners: RUNNER_ORDER.map((name) => ({ name, seconds: byName.get(name) ?? 0 })),
  };
}

export const beginRun = createServerFn({ method: "POST" })
  .validator((input: { token?: string } | undefined) => (typeof input?.token === "string" ? input.token : ""))
  .handler(async ({ data: token }) => {
    const key = await tokenHash(token);
    if (!key) return { ok: false as const };
    const sql = await getSql();
    const live = await sql<{ meters: number; idle: number }>`
      select meters::int as meters,
             extract(epoch from (clock_timestamp() - touched_at))::float as idle
      from rail_open_run
      where person_key = ${key}
    `;
    const row = live[0];
    if (row && row.meters > 0 && row.idle < 15) return { ok: true as const };
    await sql`
      insert into rail_open_run (person_key, started_at, touched_at, meters, coins, played, spare, shields, magnets, surges)
      values (${key}, now(), now(), 0, 0, 0, ${RUN_SPARE}, 0, 0, 0)
      on conflict (person_key) do update
      set started_at = now(), touched_at = now(), meters = 0, coins = 0, played = 0, spare = ${RUN_SPARE},
          shields = 0, magnets = 0, surges = 0
    `;
    return { ok: true as const };
  });

export const tickRun = createServerFn({ method: "POST" })
  .validator((input: { token?: string; meters?: number; coins?: number; score?: number; shields?: number; magnets?: number; surges?: number }) => ({
    token: typeof input?.token === "string" ? input.token : "",
    meters: Math.max(0, Math.min(1_000_000, Math.floor(Number(input?.meters) || 0))),
    coins: Math.max(0, Math.min(1_000_000, Math.floor(Number(input?.coins) || 0))),
    score: Math.max(0, Math.min(10_000_000, Math.floor(Number(input?.score) || 0))),
    shields: input?.shields == null ? -1 : cleanCount(input.shields),
    magnets: input?.magnets == null ? -1 : cleanCount(input.magnets),
    surges: input?.surges == null ? -1 : cleanCount(input.surges),
  }))
  .handler(async ({ data }) => {
    const key = await tokenHash(data.token);
    if (!key || !scoreFits(data.meters, data.coins, data.score)) return { ok: false as const };
    const sql = await getSql();
    const rows = await sql<{ meters: number; coins: number; gap: number; played: number; spare: number; shields: number; magnets: number; surges: number }>`
      select meters::int as meters,
             coins::int as coins,
             played::float as played,
             spare::int as spare,
             shields::int as shields,
             magnets::int as magnets,
             surges::int as surges,
             extract(epoch from (clock_timestamp() - touched_at))::float as gap
      from rail_open_run
      where person_key = ${key}
    `;
    const open = rows[0];
    if (!open) return { ok: false as const };
    const heldMeters = Number(open.meters) || 0;
    const heldCoins = Number(open.coins) || 0;
    const gap = Math.max(0, Number(open.gap) || 0);
    const spare = Math.max(0, Number(open.spare) || 0);
    if (data.meters < heldMeters || data.coins < heldCoins) return { ok: false as const };
    const legal = metersGranted(heldMeters, gap, Math.min(spare, 48));
    const ahead = data.meters > legal;
    if (!ahead && !scoreFits(data.meters, data.coins, data.score)) return { ok: false as const };
    const nextMeters = Math.min(data.meters, legal);
    if (nextMeters <= heldMeters) return { ok: false as const };
    let nextCoins = Math.min(data.coins, maxCoinsFor(nextMeters));
    if (nextCoins < heldCoins) nextCoins = heldCoins;
    const nextSpare = spareAfter(heldMeters, gap, nextMeters, spare);
    const gained = Math.min(gap, TICK_WINDOW_SEC);
    const played = (Number(open.played) || 0) + gained;
    const shields = fitPickup(Number(open.shields) || 0, data.shields, gap, nextMeters);
    const magnets = fitPickup(Number(open.magnets) || 0, data.magnets, gap, nextMeters);
    const surges = fitPickup(Number(open.surges) || 0, data.surges, gap, nextMeters);
    const updated = await sql`
      update rail_open_run
      set meters = ${nextMeters},
          coins = ${nextCoins},
          played = ${played},
          spare = ${nextSpare},
          shields = ${shields},
          magnets = ${magnets},
          surges = ${surges},
          touched_at = clock_timestamp()
      where person_key = ${key}
        and meters <= ${nextMeters}
        and coins <= ${nextCoins}
      returning meters
    `;
    return { ok: Boolean(updated[0]) as boolean };
  });

async function takeGranted(token: string, meters: number, coins: number, score: number) {
  const key = await tokenHash(token);
  if (!key || meters < 8 || !scoreFits(meters, coins, score)) return null;
  const sql = await getSql();
  const rows = await sql<{ meters: number; gap: number; elapsed: number; played: number; spare: number; shields: number; magnets: number; surges: number }>`
    select meters::int as meters,
           played::float as played,
           spare::int as spare,
           shields::int as shields,
           magnets::int as magnets,
           surges::int as surges,
           extract(epoch from (clock_timestamp() - touched_at))::float as gap,
           extract(epoch from (clock_timestamp() - started_at))::float as elapsed
    from rail_open_run
    where person_key = ${key}
  `;
  const open = rows[0];
  if (!open) return null;
  const elapsed = Math.max(0, Number(open.elapsed) || 0);
  const heldMeters = Number(open.meters) || 0;
  const gap = Math.max(0, Number(open.gap) || 0);
  const banked = Number(open.played) || 0;
  const spare = Math.max(0, Number(open.spare) || 0);
  const tailSpare = Math.min(spare, 48);
  const capMeters = Math.min(
    metersGranted(heldMeters, gap, tailSpare),
    Math.floor(SPEED_CAP * elapsed) + 1 + tailSpare,
  );
  // A brand-new run just replaced this one. Leave it so the new run can finish.
  if (heldMeters < 30 && elapsed < 20 && meters > capMeters) return null;
  await sql`delete from rail_open_run where person_key = ${key}`;
  if (banked < 0.4) return null;
  const watched = fitWatchedRun(meters, coins, score, capMeters);
  if (!watched || watched.meters < 8) return null;
  const tail = meters > heldMeters ? Math.min(gap, TICK_WINDOW_SEC) : 0;
  const played = activeSeconds(watched.meters, banked, elapsed, tail);
  if (!scoreWithinTime(watched.score, played)) return null;
  const seconds = Math.max(1, Math.round(played));
  return {
    seconds,
    meters: watched.meters,
    coins: watched.coins,
    score: watched.score,
    shields: Number(open.shields) || 0,
    magnets: Number(open.magnets) || 0,
    surges: Number(open.surges) || 0,
  };
}

function cleanCount(raw: unknown) {
  return Math.max(0, Math.min(10_000, Math.floor(Number(raw) || 0)));
}

/** A check-in can only add a few pickups. The banked count never jumps to a made-up total. */
function fitPickup(held: number, reported: number, gap: number, meters: number) {
  if (reported < 0) return clampSkull(held, meters);
  const room = held + Math.max(1, Math.min(4, Math.ceil(Math.max(0, gap)) + 1));
  return clampSkull(Math.min(Math.max(held, reported), room), meters);
}

function clampSkull(count: number, meters: number) {
  return Math.min(count, Math.floor(Math.max(0, meters) / 8) + 8);
}

async function skullTotals(personKey?: string): Promise<SkullCounts> {
  const sql = await getSql();
  const rows = personKey
    ? await sql<{ shield: number; magnet: number; surge: number }>`
        select coalesce(sum(shields), 0)::int as shield,
               coalesce(sum(magnets), 0)::int as magnet,
               coalesce(sum(surges), 0)::int as surge
        from rail_play
        where person_key = ${personKey}
          and (
            (meters >= 8 and seconds >= 1 and seconds <= (meters / 12.0) + 90)
            or (meters = 0 and seconds between 1 and 900)
          )
      `
    : await sql<{ shield: number; magnet: number; surge: number }>`
        select coalesce(sum(shields), 0)::int as shield,
               coalesce(sum(magnets), 0)::int as magnet,
               coalesce(sum(surges), 0)::int as surge
        from rail_play
        where (
          meters >= 8 and seconds >= 1 and seconds <= (meters / 12.0) + 90
        ) or (
          meters = 0 and seconds between 1 and 900
        )
      `;
  const row = rows[0];
  return {
    shield: Number(row?.shield) || 0,
    magnet: Number(row?.magnet) || 0,
    surge: Number(row?.surge) || 0,
  };
}

async function diamondTotals(personKey?: string) {
  const sql = await getSql();
  const rows = personKey
    ? await sql<{ skulls: number }>`
        select coalesce(sum(skulls), 0)::int as skulls
        from rail_diamond
        where person_key = ${personKey}
      `
    : await sql<{ skulls: number }>`
        select coalesce(sum(skulls), 0)::int as skulls
        from rail_diamond
      `;
  return Number(rows[0]?.skulls) || 0;
}

const UNLOCK_COST = 169;

type EarnedGoal = { id: string; skulls: number };

function emptyWallet() {
  return {
    ok: false as const,
    skulls: 0,
    pinky: false,
    koko: false,
    spooky: false,
    ramdawg: false,
    otter: false,
    figge: false,
    thehodlr: false,
    afterape: false,
    deadbeaver: false,
    quit: false,
    dupes: false,
    boggybond: false,
    gigatron: false,
    fill: 0,
    paid: [] as string[],
    daily: emptyTally(),
    weekly: emptyTally(),
    earned: [] as EarnedGoal[],
  };
}

function periodEnd(start: string, days: number) {
  const day = new Date(`${start}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString();
}

async function absorbGuest(hash: string, userId: string) {
  const guest = `g:${hash}`;
  if (!userId || guest === userId) return;
  const sql = await getSql();
  await sql`update rail_play set person_key = ${userId} where person_key = ${guest}`;
  await sql`
    insert into rail_goal_pay (person_key, period_key, goal_id, skulls)
    select ${userId}, period_key, goal_id, skulls
    from rail_goal_pay
    where person_key = ${guest}
    on conflict (person_key, period_key, goal_id) do nothing
  `;
  await sql`delete from rail_goal_pay where person_key = ${guest}`;
  await sql`
    with guest_row as (
      select skulls, pinky, koko, spooky, ramdawg, otter, figge, thehodlr, afterape, deadbeaver, quit, dupes, boggybond, gigatron, pickup_mark, pickup_paid
      from rail_diamond
      where person_key = ${guest}
    ),
    cleared as (
      update rail_diamond
      set skulls = 0, pickup_mark = 0, pickup_paid = 0
      where person_key = ${guest}
    )
    insert into rail_diamond (person_key, skulls, pinky, koko, spooky, ramdawg, otter, figge, thehodlr, afterape, deadbeaver, quit, dupes, boggybond, gigatron, pickup_mark, pickup_paid)
    select ${userId}, skulls, pinky, koko, spooky, ramdawg, otter, figge, thehodlr, afterape, deadbeaver, quit, dupes, boggybond, gigatron, pickup_mark, pickup_paid from guest_row
    on conflict (person_key) do update
    set skulls = rail_diamond.skulls + excluded.skulls,
        pinky = greatest(rail_diamond.pinky, excluded.pinky),
        koko = greatest(rail_diamond.koko, excluded.koko),
        spooky = greatest(rail_diamond.spooky, excluded.spooky),
        ramdawg = greatest(rail_diamond.ramdawg, excluded.ramdawg),
        otter = greatest(rail_diamond.otter, excluded.otter),
        figge = greatest(rail_diamond.figge, excluded.figge),
        thehodlr = greatest(rail_diamond.thehodlr, excluded.thehodlr),
        afterape = greatest(rail_diamond.afterape, excluded.afterape),
        deadbeaver = greatest(rail_diamond.deadbeaver, excluded.deadbeaver),
        quit = greatest(rail_diamond.quit, excluded.quit),
        dupes = greatest(rail_diamond.dupes, excluded.dupes),
        boggybond = greatest(rail_diamond.boggybond, excluded.boggybond),
        gigatron = greatest(rail_diamond.gigatron, excluded.gigatron),
        pickup_mark = rail_diamond.pickup_mark + excluded.pickup_mark,
        pickup_paid = rail_diamond.pickup_paid + excluded.pickup_paid
  `;
  await sql`
    update rail_diamond as saved
    set pinky = greatest(saved.pinky, guest.pinky),
        koko = greatest(saved.koko, guest.koko),
        spooky = greatest(saved.spooky, guest.spooky),
        ramdawg = greatest(saved.ramdawg, guest.ramdawg),
        otter = greatest(saved.otter, guest.otter),
        figge = greatest(saved.figge, guest.figge),
        thehodlr = greatest(saved.thehodlr, guest.thehodlr),
        afterape = greatest(saved.afterape, guest.afterape),
        deadbeaver = greatest(saved.deadbeaver, guest.deadbeaver),
        quit = greatest(saved.quit, guest.quit),
        dupes = greatest(saved.dupes, guest.dupes),
        boggybond = greatest(saved.boggybond, guest.boggybond),
        gigatron = greatest(saved.gigatron, guest.gigatron)
    from rail_diamond as guest
    where saved.person_key = ${userId}
      and guest.person_key = ${guest}
  `;
}

async function playTally(personKey: string, start: string, end: string): Promise<Tally> {
  const sql = await getSql();
  const rows = await sql<{
    runs: number;
    coins: number;
    meters: number;
    best_score: number;
    best_meters: number;
    shields: number;
    magnets: number;
    surges: number;
    apecat: number;
    boggy: number;
    gimbo: number;
    pinky: number;
    koko: number;
    spooky: number;
    ramdawg: number;
    otter: number;
    figge: number;
    thehodlr: number;
    afterape: number;
    deadbeaver: number;
    quit: number;
    dupes: number;
    boggybond: number;
    gigatron: number;
  }>`
    select count(*)::int as runs,
           coalesce(sum(coins), 0)::int as coins,
           coalesce(sum(meters), 0)::int as meters,
           coalesce(max(score), 0)::int as best_score,
           coalesce(max(meters), 0)::int as best_meters,
           coalesce(sum(shields), 0)::int as shields,
           coalesce(sum(magnets), 0)::int as magnets,
           coalesce(sum(surges), 0)::int as surges,
           coalesce(sum(case when runner = 'APECAT' then 1 else 0 end), 0)::int as apecat,
           coalesce(sum(case when runner in ('BOGGY', 'BOGGO') then 1 else 0 end), 0)::int as boggy,
           coalesce(sum(case when runner = 'GIMBO' then 1 else 0 end), 0)::int as gimbo,
           coalesce(sum(case when runner = 'PINKY' then 1 else 0 end), 0)::int as pinky,
           coalesce(sum(case when runner = 'KOKO' then 1 else 0 end), 0)::int as koko,
           coalesce(sum(case when runner = 'SPOOKY' then 1 else 0 end), 0)::int as spooky,
           coalesce(sum(case when runner = 'RAMDAWG' then 1 else 0 end), 0)::int as ramdawg,
           coalesce(sum(case when runner = 'OTTER' then 1 else 0 end), 0)::int as otter,
           coalesce(sum(case when runner = 'FIGGE' then 1 else 0 end), 0)::int as figge,
           coalesce(sum(case when runner = 'THEHODLR' then 1 else 0 end), 0)::int as thehodlr,
           coalesce(sum(case when runner = 'AFTERAPE' then 1 else 0 end), 0)::int as afterape,
           coalesce(sum(case when runner = 'DEADBEAVER' then 1 else 0 end), 0)::int as deadbeaver,
           coalesce(sum(case when runner = 'QUIT' then 1 else 0 end), 0)::int as quit,
           coalesce(sum(case when runner = 'DUPES' then 1 else 0 end), 0)::int as dupes,
           coalesce(sum(case when runner = 'BOGGYBOND' then 1 else 0 end), 0)::int as boggybond,
           coalesce(sum(case when runner = 'GIGATRON' then 1 else 0 end), 0)::int as gigatron
    from rail_play
    where person_key = ${personKey}
      and created_at >= ${start}::timestamptz
      and created_at < ${end}::timestamptz
      and meters >= 8
      and seconds >= 1
      and seconds <= (meters / 12.0) + 90
  `;
  const row = rows[0];
  const tally = emptyTally();
  if (!row) return tally;
  tally.runs = Number(row.runs) || 0;
  tally.coins = Number(row.coins) || 0;
  tally.meters = Number(row.meters) || 0;
  tally.bestScore = Number(row.best_score) || 0;
  tally.bestMeters = Number(row.best_meters) || 0;
  tally.shields = Number(row.shields) || 0;
  tally.magnets = Number(row.magnets) || 0;
  tally.surges = Number(row.surges) || 0;
  tally.rides = {
    APECAT: Number(row.apecat) || 0,
    BOGGY: Number(row.boggy) || 0,
    GIMBO: Number(row.gimbo) || 0,
    PINKY: Number(row.pinky) || 0,
    KOKO: Number(row.koko) || 0,
    SPOOKY: Number(row.spooky) || 0,
    RAMDAWG: Number(row.ramdawg) || 0,
    OTTER: Number(row.otter) || 0,
    FIGGE: Number(row.figge) || 0,
    THEHODLR: Number(row.thehodlr) || 0,
    AFTERAPE: Number(row.afterape) || 0,
    DEADBEAVER: Number(row.deadbeaver) || 0,
    QUIT: Number(row.quit) || 0,
    DUPES: Number(row.dupes) || 0,
    BOGGYBOND: Number(row.boggybond) || 0,
    GIGATRON: Number(row.gigatron) || 0,
  };
  return tally;
}

async function creditGoals(personKey: string) {
  const day = utcDay();
  const week = utcWeek();
  const daily = await playTally(personKey, `${day}T00:00:00.000Z`, periodEnd(day, 1));
  const weekly = await playTally(personKey, `${week}T00:00:00.000Z`, periodEnd(week, 7));
  const sql = await getSql();
  const flags = await sql<{ pinky: number; koko: number; spooky: number; ramdawg: number; otter: number; figge: number; thehodlr: number; afterape: number; deadbeaver: number; quit: number; dupes: number; boggybond: number; gigatron: number }>`
    select pinky::int as pinky, koko::int as koko, spooky::int as spooky, ramdawg::int as ramdawg, otter::int as otter, figge::int as figge, thehodlr::int as thehodlr, afterape::int as afterape, deadbeaver::int as deadbeaver, quit::int as quit, dupes::int as dupes, boggybond::int as boggybond, gigatron::int as gigatron
    from rail_diamond
    where person_key = ${personKey}
  `;
  const unlocked = {
    pinky: Number(flags[0]?.pinky) === 1,
    koko: Number(flags[0]?.koko) === 1,
    spooky: Number(flags[0]?.spooky) === 1,
    ramdawg: Number(flags[0]?.ramdawg) === 1,
    otter: Number(flags[0]?.otter) === 1,
    figge: Number(flags[0]?.figge) === 1,
    thehodlr: Number(flags[0]?.thehodlr) === 1,
    afterape: Number(flags[0]?.afterape) === 1,
    deadbeaver: Number(flags[0]?.deadbeaver) === 1,
    quit: Number(flags[0]?.quit) === 1,
    dupes: Number(flags[0]?.dupes) === 1,
    boggybond: Number(flags[0]?.boggybond) === 1,
    gigatron: Number(flags[0]?.gigatron) === 1,
  };
  const earned: EarnedGoal[] = [];
  for (const goal of GOALS) {
    const periodKey = goal.period === "daily" ? day : week;
    const tally = goal.period === "daily" ? daily : weekly;
    if (!goalDone(goal, tally, unlocked)) continue;
    const inserted = await sql<{ goal_id: string }>`
      insert into rail_goal_pay (person_key, period_key, goal_id, skulls)
      values (${personKey}, ${periodKey}, ${goal.id}, ${goal.skulls})
      on conflict (person_key, period_key, goal_id) do nothing
      returning goal_id
    `;
    if (inserted[0]) earned.push({ id: goal.id, skulls: goal.skulls });
  }
  const add = earned.reduce((sum, goal) => sum + goal.skulls, 0);
  if (add > 0) {
    await sql`
      insert into rail_diamond (person_key, skulls)
      values (${personKey}, ${add})
      on conflict (person_key) do update
      set skulls = rail_diamond.skulls + ${add}
    `;
  }
  return earned;
}

const PICKUP_BUNDLE = 100;

async function pickupProgress(personKey: string) {
  const sql = await getSql();
  const totals = await sql<{ total: number }>`
    select coalesce(sum(shields + magnets + surges), 0)::int as total
    from rail_play
    where person_key = ${personKey}
  `;
  const flags = await sql<{ mark: number; paid: number }>`
    select pickup_mark::int as mark, pickup_paid::int as paid
    from rail_diamond
    where person_key = ${personKey}
  `;
  const total = Number(totals[0]?.total) || 0;
  const mark = Number(flags[0]?.mark) || 0;
  const paid = Number(flags[0]?.paid) || 0;
  const progress = Math.max(0, total - mark);
  return { progress, paid, fill: progress % PICKUP_BUNDLE, owed: Math.floor(progress / PICKUP_BUNDLE) };
}

async function creditPickupSkulls(personKey: string) {
  const { owed, paid } = await pickupProgress(personKey);
  const add = owed - paid;
  if (add <= 0) return 0;
  const sql = await getSql();
  const updated = await sql<{ skulls: number }>`
    insert into rail_diamond (person_key, skulls, pickup_paid)
    values (${personKey}, ${add}, ${owed})
    on conflict (person_key) do update
    set skulls = rail_diamond.skulls + ${add},
        pickup_paid = ${owed}
    where rail_diamond.pickup_paid < ${owed}
    returning skulls::int as skulls
  `;
  return updated[0] ? add : 0;
}

async function runnerAllowed(personKey: string, runner: string) {
  if (
    runner !== "PINKY" &&
    runner !== "KOKO" &&
    runner !== "SPOOKY" &&
    runner !== "RAMDAWG" &&
    runner !== "OTTER" &&
    runner !== "FIGGE" &&
    runner !== "THEHODLR" &&
    runner !== "AFTERAPE" &&
    runner !== "DEADBEAVER" &&
    runner !== "QUIT" &&
    runner !== "DUPES" &&
    runner !== "BOGGYBOND" &&
    runner !== "GIGATRON"
  )
    return true;
  const sql = await getSql();
  const rows = await sql<{ pinky: number; koko: number; spooky: number; ramdawg: number; otter: number; figge: number; thehodlr: number; afterape: number; deadbeaver: number; quit: number; dupes: number; boggybond: number; gigatron: number }>`
    select pinky::int as pinky, koko::int as koko, spooky::int as spooky, ramdawg::int as ramdawg, otter::int as otter, figge::int as figge, thehodlr::int as thehodlr, afterape::int as afterape, deadbeaver::int as deadbeaver, quit::int as quit, dupes::int as dupes, boggybond::int as boggybond, gigatron::int as gigatron
    from rail_diamond
    where person_key = ${personKey}
  `;
  if (runner === "PINKY") return Number(rows[0]?.pinky) === 1;
  if (runner === "KOKO") return Number(rows[0]?.koko) === 1;
  if (runner === "SPOOKY") return Number(rows[0]?.spooky) === 1;
  if (runner === "RAMDAWG") return Number(rows[0]?.ramdawg) === 1;
  if (runner === "OTTER") return Number(rows[0]?.otter) === 1;
  if (runner === "FIGGE") return Number(rows[0]?.figge) === 1;
  if (runner === "THEHODLR") return Number(rows[0]?.thehodlr) === 1;
  if (runner === "AFTERAPE") return Number(rows[0]?.afterape) === 1;
  if (runner === "DEADBEAVER") return Number(rows[0]?.deadbeaver) === 1;
  if (runner === "QUIT") return Number(rows[0]?.quit) === 1;
  if (runner === "DUPES") return Number(rows[0]?.dupes) === 1;
  if (runner === "BOGGYBOND") return Number(rows[0]?.boggybond) === 1;
  return Number(rows[0]?.gigatron) === 1;
}

function watchedPickups(held: number, reported: number, meters: number) {
  return clampSkull(Math.min(held + 2, Math.max(held, reported)), meters);
}

async function readWallet(token: string, earned: EarnedGoal[] = []) {
  const user = await resolveUser(token);
  const hash = await tokenHash(token);
  if (!hash && !user) return emptyWallet();
  if (user && hash) await absorbGuest(hash, user.user_id);
  const key = user?.user_id || (hash ? `g:${hash}` : "");
  if (!key) return emptyWallet();
  const day = utcDay();
  const week = utcWeek();
  const [daily, weekly] = await Promise.all([
    playTally(key, `${day}T00:00:00.000Z`, periodEnd(day, 1)),
    playTally(key, `${week}T00:00:00.000Z`, periodEnd(week, 7)),
  ]);
  const sql = await getSql();
  const rows = await sql<{ skulls: number; pinky: number; koko: number; spooky: number; ramdawg: number; otter: number; figge: number; thehodlr: number; afterape: number; deadbeaver: number; quit: number; dupes: number; boggybond: number; gigatron: number }>`
    select skulls::int as skulls, pinky::int as pinky, koko::int as koko, spooky::int as spooky, ramdawg::int as ramdawg, otter::int as otter, figge::int as figge, thehodlr::int as thehodlr, afterape::int as afterape, deadbeaver::int as deadbeaver, quit::int as quit, dupes::int as dupes, boggybond::int as boggybond, gigatron::int as gigatron
    from rail_diamond
    where person_key = ${key}
  `;
  const paidRows = await sql<{ period_key: string; goal_id: string }>`
    select period_key, goal_id
    from rail_goal_pay
    where person_key = ${key}
      and (period_key = ${day} or period_key = ${week})
  `;
  const wallet = await pickupProgress(key);
  return {
    ok: true as const,
    skulls: Number(rows[0]?.skulls) || 0,
    pinky: Number(rows[0]?.pinky) === 1,
    koko: Number(rows[0]?.koko) === 1,
    spooky: Number(rows[0]?.spooky) === 1,
    ramdawg: Number(rows[0]?.ramdawg) === 1,
    otter: Number(rows[0]?.otter) === 1,
    figge: Number(rows[0]?.figge) === 1,
    thehodlr: Number(rows[0]?.thehodlr) === 1,
    afterape: Number(rows[0]?.afterape) === 1,
    deadbeaver: Number(rows[0]?.deadbeaver) === 1,
    quit: Number(rows[0]?.quit) === 1,
    dupes: Number(rows[0]?.dupes) === 1,
    boggybond: Number(rows[0]?.boggybond) === 1,
    gigatron: Number(rows[0]?.gigatron) === 1,
    fill: wallet.fill,
    paid: paidRows.map((row) => `${row.period_key}:${row.goal_id}`),
    daily,
    weekly,
    earned,
  };
}

export const syncDiamonds = createServerFn({ method: "POST" })
  .validator((input: { token?: string } | undefined) => (typeof input?.token === "string" ? input.token : ""))
  .handler(async ({ data: token }) => readWallet(token));

export const unlockRunner = createServerFn({ method: "POST" })
  .validator((input: { token?: string; runner?: string } | undefined) => ({
    token: typeof input?.token === "string" ? input.token : "",
    runner:
      input?.runner === "KOKO"
        ? "KOKO"
        : input?.runner === "PINKY"
          ? "PINKY"
          : input?.runner === "SPOOKY"
            ? "SPOOKY"
            : input?.runner === "RAMDAWG"
              ? "RAMDAWG"
              : input?.runner === "OTTER"
              ? "OTTER"
              : input?.runner === "FIGGE"
                ? "FIGGE"
                : input?.runner === "THEHODLR"
                  ? "THEHODLR"
                  : input?.runner === "AFTERAPE"
                    ? "AFTERAPE"
                    : input?.runner === "DEADBEAVER"
                      ? "DEADBEAVER"
                      : input?.runner === "QUIT"
                        ? "QUIT"
                        : input?.runner === "DUPES"
                          ? "DUPES"
                          : input?.runner === "BOGGYBOND"
                            ? "BOGGYBOND"
                            : input?.runner === "GIGATRON"
                              ? "GIGATRON"
                              : "",
  }))
  .handler(async ({ data }) => {
    if (!data.runner) return emptyWallet();
    const user = await resolveUser(data.token);
    const hash = await tokenHash(data.token);
    if (!hash && !user) return emptyWallet();
    if (user && hash) await absorbGuest(hash, user.user_id);
    const key = user?.user_id || (hash ? `g:${hash}` : "");
    if (!key) return emptyWallet();
    const sql = await getSql();
    const column =
      data.runner === "PINKY"
        ? "pinky"
        : data.runner === "KOKO"
          ? "koko"
          : data.runner === "SPOOKY"
            ? "spooky"
            : data.runner === "RAMDAWG"
              ? "ramdawg"
              : data.runner === "OTTER"
                ? "otter"
                : data.runner === "FIGGE"
                  ? "figge"
                  : data.runner === "THEHODLR"
                    ? "thehodlr"
                    : data.runner === "AFTERAPE"
                      ? "afterape"
                      : data.runner === "DEADBEAVER"
                        ? "deadbeaver"
                        : data.runner === "QUIT"
                          ? "quit"
                          : data.runner === "DUPES"
                            ? "dupes"
                            : data.runner === "BOGGYBOND"
                              ? "boggybond"
                              : "gigatron";
    const spent = await sql<{ skulls: number }>`
      update rail_diamond
      set skulls = skulls - ${UNLOCK_COST},
          pinky = case when ${column} = 'pinky' then 1 else pinky end,
          koko = case when ${column} = 'koko' then 1 else koko end,
          spooky = case when ${column} = 'spooky' then 1 else spooky end,
          ramdawg = case when ${column} = 'ramdawg' then 1 else ramdawg end,
          otter = case when ${column} = 'otter' then 1 else otter end,
          figge = case when ${column} = 'figge' then 1 else figge end,
          thehodlr = case when ${column} = 'thehodlr' then 1 else thehodlr end,
          afterape = case when ${column} = 'afterape' then 1 else afterape end,
          deadbeaver = case when ${column} = 'deadbeaver' then 1 else deadbeaver end,
          quit = case when ${column} = 'quit' then 1 else quit end,
          dupes = case when ${column} = 'dupes' then 1 else dupes end,
          boggybond = case when ${column} = 'boggybond' then 1 else boggybond end,
          gigatron = case when ${column} = 'gigatron' then 1 else gigatron end
      where person_key = ${key}
        and skulls >= ${UNLOCK_COST}
        and (
          (${column} = 'pinky' and pinky = 0)
          or (${column} = 'koko' and koko = 0)
          or (${column} = 'spooky' and spooky = 0)
          or (${column} = 'ramdawg' and ramdawg = 0)
          or (${column} = 'otter' and otter = 0)
          or (${column} = 'figge' and figge = 0)
          or (${column} = 'thehodlr' and thehodlr = 0)
          or (${column} = 'afterape' and afterape = 0)
          or (${column} = 'deadbeaver' and deadbeaver = 0)
          or (${column} = 'quit' and quit = 0)
          or (${column} = 'dupes' and dupes = 0)
          or (${column} = 'boggybond' and boggybond = 0)
          or (${column} = 'gigatron' and gigatron = 0)
        )
      returning skulls::int as skulls
    `;
    if (!spent[0]) {
      const current = await readWallet(data.token);
      const already =
        data.runner === "PINKY"
          ? current.pinky
          : data.runner === "KOKO"
            ? current.koko
            : data.runner === "SPOOKY"
              ? current.spooky
              : data.runner === "RAMDAWG"
                ? current.ramdawg
                : data.runner === "OTTER"
                  ? current.otter
                  : data.runner === "FIGGE"
                    ? current.figge
                    : data.runner === "THEHODLR"
                      ? current.thehodlr
                      : data.runner === "AFTERAPE"
                        ? current.afterape
                        : data.runner === "DEADBEAVER"
                          ? current.deadbeaver
                          : data.runner === "QUIT"
                            ? current.quit
                            : data.runner === "DUPES"
                              ? current.dupes
                              : data.runner === "BOGGYBOND"
                                ? current.boggybond
                                : current.gigatron;
      return already ? { ...current, ok: true as const } : { ...current, ok: false as const };
    }
    return readWallet(data.token);
  });

async function insertPlay(
  personKey: string,
  runner: string,
  seconds: number,
  score: number,
  coins: number,
  meters: number,
  shields: number,
  magnets: number,
  surges: number,
) {
  const sql = await getSql();
  await sql`
    insert into rail_play (person_key, runner, seconds, score, coins, meters, shields, magnets, surges)
    values (${personKey}, ${runner}, ${seconds}, ${score}, ${coins}, ${meters}, ${shields}, ${magnets}, ${surges})
  `;
}

export const getStats = createServerFn({ method: "POST" })
  .validator((input: { token?: string } | undefined) => (typeof input?.token === "string" ? input.token : ""))
  .handler(async ({ data: token }): Promise<RailStats> => {
    const sql = await getSql();
    const totals = await sql<{ players: number; seconds: number; coins: number }>`
      select count(distinct person_key)::int as players,
             coalesce(sum(seconds), 0)::int as seconds,
             coalesce(sum(coins), 0)::int as coins
      from rail_play
      where (
        meters >= 8 and seconds >= 1 and seconds <= (meters / 12.0) + 90
      ) or (
        meters = 0 and seconds between 1 and 900
      )
    `;
    const rows = await sql<{ runner: string; seconds: number }>`
      select case when runner = 'BOGGO' then 'BOGGY' else runner end as runner,
             coalesce(sum(seconds), 0)::int as seconds
      from rail_play
      where (
        meters >= 8 and seconds >= 1 and seconds <= (meters / 12.0) + 90
      ) or (
        meters = 0 and seconds between 1 and 900
      )
      group by 1
    `;
    const user = await resolveUser(token);
    const hash = await tokenHash(token);
    const keys = [user?.user_id, hash ? `g:${hash}` : ""].filter((key): key is string => Boolean(key));
    const mineMap = new Map<string, number>();
    let best = 0;
    let coins = 0;
    for (const key of keys) {
      const part = await sql<{ runner: string; seconds: number }>`
        select case when runner = 'BOGGO' then 'BOGGY' else runner end as runner,
               coalesce(sum(seconds), 0)::int as seconds
        from rail_play
        where person_key = ${key}
          and (
            (meters >= 8 and seconds >= 1 and seconds <= (meters / 12.0) + 90)
            or (meters = 0 and seconds between 1 and 900)
          )
        group by 1
      `;
      for (const row of part) {
        mineMap.set(row.runner, (mineMap.get(row.runner) ?? 0) + (Number(row.seconds) || 0));
      }
      const marks = await sql<{ best: number; coins: number }>`
        select coalesce(max(score), 0)::int as best,
               coalesce(sum(coins), 0)::int as coins
        from rail_play
        where person_key = ${key}
          and (
            (meters >= 8 and seconds >= 1 and seconds <= (meters / 12.0) + 90)
            or (meters = 0 and seconds between 1 and 900)
          )
      `;
      best = Math.max(best, Number(marks[0]?.best) || 0);
      coins += Number(marks[0]?.coins) || 0;
    }
    let rank: number | null = null;
    if (user?.user_id) {
      const runs = await sql<{ best: number; coins: number }>`
        select coalesce(max(score), 0)::int as best,
               coalesce(sum(coins), 0)::int as coins
        from rail_runs
        where user_id = ${user.user_id}
          and meters >= 8
          and seconds <= (meters / 12.0) + 90
      `;
      best = Math.max(best, Number(runs[0]?.best) || 0);
      if (coins === 0) coins = Number(runs[0]?.coins) || 0;
      const placed = await sql<{ score: number; created_at: string }>`
        select coalesce(max(r.score), 0)::int as score,
               p.created_at::text as created_at
        from rail_players p
        left join rail_runs r on r.user_id = p.user_id
        where p.user_id = ${user.user_id}
        group by p.created_at
      `;
      const mineScore = Number(placed[0]?.score) || 0;
      const mineAt = placed[0]?.created_at ?? "";
      if (mineScore > 0 && mineAt) {
        const ahead = await sql<{ ahead: number }>`
          select count(*)::int as ahead
          from (
            select p.user_id,
                   coalesce(max(r.score), 0)::int as score,
                   p.created_at
            from rail_players p
            left join rail_runs r on r.user_id = p.user_id
            group by p.user_id, p.created_at
            having coalesce(max(r.score), 0) > 0
          ) b
          where b.score > ${mineScore}
             or (b.score = ${mineScore} and b.created_at < ${mineAt}::timestamptz)
        `;
        rank = (Number(ahead[0]?.ahead) || 0) + 1;
      }
    }
    const mine = [...mineMap.entries()].map(([runner, seconds]) => ({ runner, seconds }));
    const mineSeconds = mine.reduce((sum, row) => sum + row.seconds, 0);
    const globalSkulls = await skullTotals();
    const globalDiamonds = await diamondTotals();
    const personalSkulls = { ...EMPTY_SKULLS };
    for (const key of keys) {
      const part = await skullTotals(key);
      personalSkulls.shield += part.shield;
      personalSkulls.magnet += part.magnet;
      personalSkulls.surge += part.surge;
    }
    const personalDiamonds = user?.user_id
      ? await diamondTotals(user.user_id)
      : hash
        ? await diamondTotals(`g:${hash}`)
        : 0;
    return {
      global: {
        players: Number(totals[0]?.players) || 0,
        coins: Number(totals[0]?.coins) || 0,
        ...sliceFrom(rows, Number(totals[0]?.seconds) || 0),
        skulls: globalSkulls,
        diamonds: globalDiamonds,
      },
      personal: { ...sliceFrom(mine, mineSeconds), best, coins, rank, skulls: personalSkulls, diamonds: personalDiamonds },
    };
  });

export const recordPlay = createServerFn({ method: "POST" })
  .validator((input: { token?: string; runner?: string; seconds?: number; score?: number; meters?: number; coins?: number; shields?: number; magnets?: number; surges?: number }) => {
    const meters = Math.max(0, Math.min(1_000_000, Math.floor(Number(input?.meters) || 0)));
    return {
      token: typeof input?.token === "string" ? input.token : "",
      runner: cleanRunner(input?.runner),
      seconds: cleanSeconds(input?.seconds),
      score: Math.max(0, Math.min(10_000_000, Math.floor(Number(input?.score) || 0))),
      meters,
      coins: Math.max(0, Math.min(1_000_000, Math.floor(Number(input?.coins) || 0))),
      shields: clampSkull(cleanCount(input?.shields), meters),
      magnets: clampSkull(cleanCount(input?.magnets), meters),
      surges: clampSkull(cleanCount(input?.surges), meters),
    };
  })
  .handler(async ({ data }) => {
    const hash = await tokenHash(data.token);
    if (!hash) return { ok: false as const };
    const granted = await takeGranted(data.token, data.meters, data.coins, data.score);
    if (!granted) return { ok: false as const };
    const person = `g:${hash}`;
    if (!(await runnerAllowed(person, data.runner))) return { ok: false as const };
    await insertPlay(
      person,
      data.runner,
      granted.seconds,
      granted.score,
      granted.coins,
      granted.meters,
      watchedPickups(granted.shields, data.shields, granted.meters),
      watchedPickups(granted.magnets, data.magnets, granted.meters),
      watchedPickups(granted.surges, data.surges, granted.meters),
    );
    await creditPickupSkulls(person);
    const earned = await creditGoals(person);
    return readWallet(data.token, earned);
  });

async function keepGhost(userId: string, score: number, runner: string, packed: string) {
  const tape = decodeGhost(packed);
  if (!tape || tape.runner !== runner) return;
  const sql = await getSql();
  const best = await sql<{ best: number }>`
    select coalesce(max(score), 0)::int as best
    from rail_runs
    where user_id = ${userId}
  `;
  if (score < (Number(best[0]?.best) || 0)) return;
  const body = JSON.stringify({ seed: tape.seed, runner: tape.runner, events: tape.events });
  await sql`
    insert into rail_ghost (user_id, seed, runner, tape, score)
    values (${userId}, ${tape.seed}, ${tape.runner}, ${body}, ${score})
    on conflict (user_id) do update
    set seed = excluded.seed,
        runner = excluded.runner,
        tape = excluded.tape,
        score = excluded.score,
        updated_at = now()
    where rail_ghost.score <= excluded.score
  `;
}

export const getGhost = createServerFn({ method: "POST" })
  .validator((input: { name?: string } | undefined) => (typeof input?.name === "string" ? input.name : ""))
  .handler(async ({ data: name }): Promise<GhostTape | null> => {
    const clean = cleanName(name);
    if (!clean) return null;
    const sql = await getSql();
    const rows = await sql<{ tape: string }>`
      select tape
      from rail_ghost g
      join rail_players p on p.user_id = g.user_id
      where p.name_key = ${clean.toLowerCase()}
    `;
    return decodeGhost(rows[0]?.tape ?? "");
  });

export const submitRun = createServerFn({ method: "POST" })
  .validator((input: { token?: string; score: number; meters: number; coins: number; runner: string; seconds?: number; shields?: number; magnets?: number; surges?: number; ghost?: string }) => {
    const score = Math.max(0, Math.min(10_000_000, Math.floor(Number(input?.score) || 0)));
    const meters = Math.max(0, Math.min(1_000_000, Math.floor(Number(input?.meters) || 0)));
    const coins = Math.max(0, Math.min(1_000_000, Math.floor(Number(input?.coins) || 0)));
    const runner = cleanRunner(input?.runner);
    const token = typeof input?.token === "string" ? input.token : "";
    const seconds = cleanSeconds(input?.seconds);
    return {
      token,
      score,
      meters,
      coins,
      runner,
      seconds,
      shields: clampSkull(cleanCount(input?.shields), meters),
      magnets: clampSkull(cleanCount(input?.magnets), meters),
      surges: clampSkull(cleanCount(input?.surges), meters),
      ghost: typeof input?.ghost === "string" ? input.ghost.slice(0, 120_000) : "",
    };
  })
  .handler(async ({ data }) => {
    const user = await resolveUser(data.token);
    if (!user) {
      return { ok: false as const, error: "Claim a name first.", board: await loadBoard("") };
    }
    const granted = await takeGranted(data.token, data.meters, data.coins, data.score);
    if (!granted) {
      return { ok: false as const, error: "That run did not count.", board: await loadBoard(user.user_id) };
    }
    const hash = await tokenHash(data.token);
    if (hash) await absorbGuest(hash, user.user_id);
    if (!(await runnerAllowed(user.user_id, data.runner))) {
      return { ok: false as const, error: "That run did not count.", board: await loadBoard(user.user_id) };
    }
    const sql = await getSql();
    await sql`
      insert into rail_runs (user_id, score, meters, coins, runner, seconds)
      values (${user.user_id}, ${granted.score}, ${granted.meters}, ${granted.coins}, ${data.runner}, ${granted.seconds})
    `;
    await keepGhost(user.user_id, granted.score, data.runner, data.ghost);
    await insertPlay(
      user.user_id,
      data.runner,
      granted.seconds,
      granted.score,
      granted.coins,
      granted.meters,
      watchedPickups(granted.shields, data.shields, granted.meters),
      watchedPickups(granted.magnets, data.magnets, granted.meters),
      watchedPickups(granted.surges, data.surges, granted.meters),
    );
    await creditPickupSkulls(user.user_id);
    const earned = await creditGoals(user.user_id);
    const wallet = await readWallet(data.token, earned);
    return { ...wallet, ok: true as const, board: await loadBoard(user.user_id) };
  });
