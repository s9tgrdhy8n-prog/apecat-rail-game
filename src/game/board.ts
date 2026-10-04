import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

export type BoardRow = {
  rank: number;
  name: string;
  score: number;
  meters: number;
  coins: number;
  runner: string;
  you: boolean;
};

export type BoardState = {
  name: string | null;
  rows: BoardRow[];
  you: BoardRow | null;
};

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

function cleanName(raw: string) {
  const name = raw.trim();
  if (!NAME_RE.test(name)) return null;
  return name;
}

function isMine(value: unknown) {
  return value === true || value === "t" || value === "true";
}

type BestRow = {
  name: string;
  created_at: string;
  score: number;
  meters: number;
  coins: number;
  runner: string;
  mine: boolean;
};

async function loadBoard(userId: string): Promise<BoardState> {
  const sql = await getSql();
  const mine = await sql<{ name: string }>`
    select name from rail_players where user_id = ${userId}
  `;
  const bests = await sql<BestRow>`
    select p.name,
           p.created_at::text as created_at,
           coalesce(max(r.score), 0)::int as score,
           coalesce((array_agg(r.meters order by r.score desc, r.id desc))[1], 0)::int as meters,
           coalesce((array_agg(r.coins order by r.score desc, r.id desc))[1], 0)::int as coins,
           coalesce((array_agg(r.runner order by r.score desc, r.id desc))[1], '') as runner,
           bool_or(p.user_id = ${userId}) as mine
    from rail_players p
    left join rail_runs r on r.user_id = p.user_id
    group by p.user_id, p.name, p.created_at
    order by score desc, p.created_at asc
  `;
  const rows: BoardRow[] = bests.slice(0, 100).map((row, index) => ({
    rank: index + 1,
    name: row.name,
    score: row.score,
    meters: row.meters,
    coins: row.coins,
    runner: row.runner,
    you: isMine(row.mine),
  }));
  const youIndex = bests.findIndex((row) => isMine(row.mine));
  const you =
    youIndex < 0
      ? null
      : {
          rank: youIndex + 1,
          name: bests[youIndex]!.name,
          score: bests[youIndex]!.score,
          meters: bests[youIndex]!.meters,
          coins: bests[youIndex]!.coins,
          runner: bests[youIndex]!.runner,
          you: true,
        };
  return { name: mine[0]?.name ?? null, rows, you };
}

export const getBoard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => loadBoard(context.userId));

export const claimName = createServerFn({ method: "POST" })
  .validator((raw: string) => (typeof raw === "string" ? raw : ""))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true; name: string } | { ok: false; error: string }> => {
    const name = cleanName(data);
    if (!name) return { ok: false, error: "Use 3–16 letters, numbers, or underscores." };
    const sql = await getSql();
    const existing = await sql<{ name: string }>`
      select name from rail_players where user_id = ${context.userId}
    `;
    if (existing[0]) return { ok: true, name: existing[0].name };
    const taken = await sql<{ name: string }>`
      select name from rail_players where name_key = ${name.toLowerCase()}
    `;
    if (taken[0]) return { ok: false, error: "That name is already on the rail." };
    try {
      await sql`
        insert into rail_players (user_id, name, name_key)
        values (${context.userId}, ${name}, ${name.toLowerCase()})
      `;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        const mine = await sql<{ name: string }>`
          select name from rail_players where user_id = ${context.userId}
        `;
        if (mine[0]) return { ok: true, name: mine[0].name };
        return { ok: false, error: "That name is already on the rail." };
      }
      throw err;
    }
    return { ok: true, name };
  });

export const submitRun = createServerFn({ method: "POST" })
  .validator((input: { score: number; meters: number; coins: number; runner: string }) => {
    const score = Math.max(0, Math.min(10_000_000, Math.floor(Number(input?.score) || 0)));
    const meters = Math.max(0, Math.min(1_000_000, Math.floor(Number(input?.meters) || 0)));
    const coins = Math.max(0, Math.min(1_000_000, Math.floor(Number(input?.coins) || 0)));
    const runner = input?.runner === "BOGGO" || input?.runner === "GIMBO" ? input.runner : "APECAT";
    return { score, meters, coins, runner };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const player = await sql<{ name: string }>`
      select name from rail_players where user_id = ${context.userId}
    `;
    if (!player[0]) return { ok: false as const, error: "Claim a name first.", board: await loadBoard(context.userId) };
    await sql`
      insert into rail_runs (user_id, score, meters, coins, runner)
      values (${context.userId}, ${data.score}, ${data.meters}, ${data.coins}, ${data.runner})
    `;
    return { ok: true as const, board: await loadBoard(context.userId) };
  });
