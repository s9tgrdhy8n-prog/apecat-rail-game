import type { RunnerName } from "@/game/types";

/** In-game credits. No cash value. */
export const CRYSTAL_NAME = "Diamond Skulls";

/** Diamond Skulls to unlock Pinky for good. */
export const PINKY_COST = 169;

/** Diamond Skulls to unlock Koko for good. */
export const KOKO_COST = 169;

export type RunFacts = {
  score: number;
  meters: number;
  coins: number;
  seconds: number;
  shields: number;
  magnets: number;
  surges: number;
  jumps: number;
  slides: number;
  maxCombo: number;
  runner: RunnerName;
};

export type Tally = {
  runs: number;
  coins: number;
  meters: number;
  seconds: number;
  shields: number;
  magnets: number;
  surges: number;
  jumps: number;
  slides: number;
  bestScore: number;
  bestMeters: number;
  bestCoins: number;
  maxCombo: number;
  runners: RunnerName[];
  rides: Record<RunnerName, number>;
};

export type Goal = {
  id: string;
  period: "daily" | "weekly";
  title: string;
  detail: string;
  skulls: number;
  target: number;
  read: (tally: Tally) => number;
};

export type AchievementSave = {
  skulls: number;
  pinky: boolean;
  koko: boolean;
  claims: string[];
  dailyKey: string;
  weeklyKey: string;
  daily: Tally;
  weekly: Tally;
};

const STORAGE_PREFIX = "apecat-rail-achievements:";

export const GOALS: Goal[] = [
  {
    id: "day-ride",
    period: "daily",
    title: "Take the tunnel",
    detail: "Finish 25 runs.",
    skulls: 1,
    target: 25,
    read: (tally) => tally.runs,
  },
  {
    id: "day-coins",
    period: "daily",
    title: "Coin pocket",
    detail: "Collect 1,200 $APECAT coins today.",
    skulls: 2,
    target: 1200,
    read: (tally) => tally.coins,
  },
  {
    id: "day-rail",
    period: "daily",
    title: "Long rail",
    detail: "Reach 2,500 meters in one run.",
    skulls: 2,
    target: 2500,
    read: (tally) => tally.bestMeters,
  },
  {
    id: "day-pickup",
    period: "daily",
    title: "Skull touch",
    detail: "Pick up 60 shield, magnet, or surge skulls.",
    skulls: 1,
    target: 60,
    read: (tally) => tally.shields + tally.magnets + tally.surges,
  },
  {
    id: "week-rides",
    period: "weekly",
    title: "450 rides",
    detail: "Finish 450 runs this week.",
    skulls: 4,
    target: 450,
    read: (tally) => tally.runs,
  },
  {
    id: "week-distance",
    period: "weekly",
    title: "Distance week",
    detail: "Cover 180,000 meters this week.",
    skulls: 5,
    target: 180000,
    read: (tally) => tally.meters,
  },
  {
    id: "week-score",
    period: "weekly",
    title: "Clean score",
    detail: "Score 30,000 in one run.",
    skulls: 6,
    target: 30000,
    read: (tally) => tally.bestScore,
  },
  {
    id: "week-crew",
    period: "weekly",
    title: "The whole crew",
    detail: "Finish 30 runs as APECAT, 30 as BOGGY, and 30 as GIMBO. Pinky and Koko count after you unlock them.",
    skulls: 5,
    target: 30,
    read: (tally) => crewProgress(tally, { pinky: false, koko: false }),
  },
];

export type UnlockFlags = { pinky: boolean; koko: boolean };

/** Lowest finished-run count across the crew. Pinky and Koko join after unlock. */
export function crewProgress(tally: Tally, unlocked: UnlockFlags) {
  const counts = [tally.rides.APECAT, tally.rides.BOGGY, tally.rides.GIMBO];
  if (unlocked.pinky) counts.push(tally.rides.PINKY);
  if (unlocked.koko) counts.push(tally.rides.KOKO);
  return Math.min(...counts);
}

export function crewDetail(unlocked: UnlockFlags) {
  const bits = ["30 as APECAT", "30 as BOGGY", "30 as GIMBO"];
  if (unlocked.pinky) bits.push("30 as PINKY");
  if (unlocked.koko) bits.push("30 as KOKO");
  return `Finish ${bits.slice(0, -1).join(", ")}, and ${bits[bits.length - 1]}.`;
}

export function emptyTally(): Tally {
  return {
    runs: 0,
    coins: 0,
    meters: 0,
    seconds: 0,
    shields: 0,
    magnets: 0,
    surges: 0,
    jumps: 0,
    slides: 0,
    bestScore: 0,
    bestMeters: 0,
    bestCoins: 0,
    maxCombo: 0,
    runners: [],
    rides: { APECAT: 0, BOGGY: 0, GIMBO: 0, PINKY: 0, KOKO: 0 },
  };
}

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function utcWeek(now = new Date()) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayOffset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - mondayOffset);
  return day.toISOString().slice(0, 10);
}

function freshSave(now = new Date()): AchievementSave {
  return {
    skulls: 0,
    pinky: false,
    koko: false,
    claims: [],
    dailyKey: utcDay(now),
    weeklyKey: utcWeek(now),
    daily: emptyTally(),
    weekly: emptyTally(),
  };
}

function num(value: unknown) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function tallyFrom(raw: unknown): Tally {
  const row = raw && typeof raw === "object" ? (raw as Partial<Tally>) : {};
  const runners = Array.isArray(row.runners)
    ? row.runners.filter((name): name is RunnerName => name === "APECAT" || name === "BOGGY" || name === "GIMBO" || name === "PINKY" || name === "KOKO")
    : [];
  return {
    runs: num(row.runs),
    coins: num(row.coins),
    meters: num(row.meters),
    seconds: num(row.seconds),
    shields: num(row.shields),
    magnets: num(row.magnets),
    surges: num(row.surges),
    jumps: num(row.jumps),
    slides: num(row.slides),
    bestScore: num(row.bestScore),
    bestMeters: num(row.bestMeters),
    bestCoins: num(row.bestCoins),
    maxCombo: num(row.maxCombo),
    runners: [...new Set(runners)],
    rides: {
      APECAT: num(row.rides?.APECAT),
      BOGGY: num(row.rides?.BOGGY),
      GIMBO: num(row.rides?.GIMBO),
      PINKY: num(row.rides?.PINKY),
      KOKO: num(row.rides?.KOKO),
    },
  };
}

function roll(save: AchievementSave, now: Date): AchievementSave {
  const dailyKey = utcDay(now);
  const weeklyKey = utcWeek(now);
  const next = {
    ...save,
    dailyKey,
    weeklyKey,
    daily: save.dailyKey === dailyKey ? save.daily : emptyTally(),
    weekly: save.weeklyKey === weeklyKey ? save.weekly : emptyTally(),
    claims: save.claims.filter((claim) => claim.startsWith(`${dailyKey}:`) || claim.startsWith(`${weeklyKey}:`)),
  };
  return next;
}

function readRaw(token: string): AchievementSave {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + token);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) as Partial<AchievementSave>;
    return {
      skulls: num(parsed.skulls),
      pinky: parsed.pinky === true,
      koko: parsed.koko === true,
      claims: Array.isArray(parsed.claims) ? parsed.claims.filter((claim) => typeof claim === "string") : [],
      dailyKey: typeof parsed.dailyKey === "string" ? parsed.dailyKey : "",
      weeklyKey: typeof parsed.weeklyKey === "string" ? parsed.weeklyKey : "",
      daily: tallyFrom(parsed.daily),
      weekly: tallyFrom(parsed.weekly),
    };
  } catch {
    return freshSave();
  }
}

function writeRaw(token: string, save: AchievementSave) {
  localStorage.setItem(STORAGE_PREFIX + token, JSON.stringify(save));
}

function dropEasyClaims(save: AchievementSave): AchievementSave {
  return {
    ...save,
    claims: save.claims.filter((claim) => {
      const id = claim.slice(claim.indexOf(":") + 1);
      const goal = GOALS.find((item) => item.id === id);
      if (!goal) return false;
      return goalDone(goal, goal.period === "daily" ? save.daily : save.weekly);
    }),
  };
}

export function loadAchievements(token: string, now = new Date()) {
  const save = dropEasyClaims(roll(readRaw(token), now));
  writeRaw(token, save);
  return save;
}

export function rememberPinky(token: string) {
  const save = loadAchievements(token);
  if (save.pinky) return save;
  const next = { ...save, pinky: true };
  writeRaw(token, next);
  return next;
}

export function lockPinky(token: string) {
  const save = loadAchievements(token);
  if (!save.pinky) return save;
  const next = { ...save, pinky: false };
  writeRaw(token, next);
  return next;
}

export function unlockPinky(token: string) {
  const save = loadAchievements(token);
  if (save.pinky) return { ok: true as const, save };
  if (save.skulls < PINKY_COST) return { ok: false as const, save };
  const next = { ...save, skulls: save.skulls - PINKY_COST, pinky: true };
  writeRaw(token, next);
  return { ok: true as const, save: next };
}

export function rememberKoko(token: string) {
  const save = loadAchievements(token);
  if (save.koko) return save;
  const next = { ...save, koko: true };
  writeRaw(token, next);
  return next;
}

export function unlockKoko(token: string) {
  const save = loadAchievements(token);
  if (save.koko) return { ok: true as const, save };
  if (save.skulls < KOKO_COST) return { ok: false as const, save };
  const next = { ...save, skulls: save.skulls - KOKO_COST, koko: true };
  writeRaw(token, next);
  return { ok: true as const, save: next };
}

export function goalProgress(goal: Goal, tally: Tally, unlocked: UnlockFlags = { pinky: false, koko: false }) {
  return Math.min(goal.target, Math.max(0, goalValue(goal, tally, unlocked)));
}

export function goalDone(goal: Goal, tally: Tally, unlocked: UnlockFlags = { pinky: false, koko: false }) {
  return goalValue(goal, tally, unlocked) >= goal.target;
}

function goalValue(goal: Goal, tally: Tally, unlocked: UnlockFlags) {
  if (goal.id === "week-crew") return crewProgress(tally, unlocked);
  return goal.read(tally);
}

export function noteRun(token: string, serial: number, _run: RunFacts, now = new Date()) {
  return { save: loadAchievements(token, now), earned: [] as Goal[] };
}

export type AchievementSnapshot = {
  skulls: number;
  pinky: boolean;
  koko: boolean;
  paid: string[];
  daily: Tally;
  weekly: Tally;
};

/** The server wallet replaces anything stored in the browser. */
export function adoptServerAchievements(token: string, snap: AchievementSnapshot) {
  const save = loadAchievements(token);
  const next: AchievementSave = {
    ...save,
    skulls: Math.max(0, Math.floor(snap.skulls) || 0),
    pinky: snap.pinky === true,
    koko: snap.koko === true,
    claims: Array.isArray(snap.paid) ? snap.paid.filter((claim) => typeof claim === "string") : [],
    daily: snap.daily,
    weekly: snap.weekly,
  };
  writeRaw(token, next);
  return next;
}
