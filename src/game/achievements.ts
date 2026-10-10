import type { RunnerName } from "@/game/types";
import { runnerLabel } from "@/game/runners";

/** In-game credits. No cash value. */
export const CRYSTAL_NAME = "Diamond Skulls";

/** Diamond Skulls to unlock Pinky for good. */
export const PINKY_COST = 169;

/** Diamond Skulls to unlock Koko for good. */
export const KOKO_COST = 169;

/** Diamond Skulls to unlock Spooky for good. */
export const SPOOKY_COST = 169;

/** Diamond Skulls to unlock Ramdawg for good. */
export const RAMDAWG_COST = 169;

/** Diamond Skulls to unlock Otter for good. */
export const OTTER_COST = 169;

/** Diamond Skulls to unlock Figge for good. */
export const FIGGE_COST = 169;

/** Diamond Skulls to unlock Thehodlr for good. */
export const THEHODLR_COST = 169;

/** Diamond Skulls to unlock After Ape for good. */
export const AFTERAPE_COST = 169;

/** Diamond Skulls to unlock Dead Beaver for good. */
export const DEADBEAVER_COST = 169;

/** Diamond Skulls to unlock Quit for good. */
export const QUIT_COST = 169;

/** Diamond Skulls to unlock Dupes for good. */
export const DUPES_COST = 169;

/** Diamond Skulls to unlock Boggy Bond for good. */
export const BOGGYBOND_COST = 169;

/** Diamond Skulls to unlock GIGATRON for good. */
export const GIGATRON_COST = 169;

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
  spooky: boolean;
  ramdawg: boolean;
  otter: boolean;
  figge: boolean;
  thehodlr: boolean;
  afterape: boolean;
  deadbeaver: boolean;
  quit: boolean;
  dupes: boolean;
  boggybond: boolean;
  gigatron: boolean;
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
    skulls: 3,
    target: 25,
    read: (tally) => tally.runs,
  },
  {
    id: "day-coins",
    period: "daily",
    title: "Coin pocket",
    detail: "Collect 1,200 $APECAT coins today.",
    skulls: 6,
    target: 1200,
    read: (tally) => tally.coins,
  },
  {
    id: "day-rail",
    period: "daily",
    title: "Long rail",
    detail: "Reach 2,500 meters in one run.",
    skulls: 6,
    target: 2500,
    read: (tally) => tally.bestMeters,
  },
  {
    id: "day-pickup",
    period: "daily",
    title: "Skull touch",
    detail: "Pick up 60 shield, magnet, or surge skulls.",
    skulls: 3,
    target: 60,
    read: (tally) => tally.shields + tally.magnets + tally.surges,
  },
  {
    id: "week-rides",
    period: "weekly",
    title: "450 rides",
    detail: "Finish 450 runs this week.",
    skulls: 12,
    target: 450,
    read: (tally) => tally.runs,
  },
  {
    id: "week-distance",
    period: "weekly",
    title: "Distance week",
    detail: "Cover 180,000 meters this week.",
    skulls: 15,
    target: 180000,
    read: (tally) => tally.meters,
  },
  {
    id: "week-score",
    period: "weekly",
    title: "Clean score",
    detail: "Score 30,000 in one run.",
    skulls: 18,
    target: 30000,
    read: (tally) => tally.bestScore,
  },
  {
    id: "week-crew",
    period: "weekly",
    title: "The whole crew",
    detail: "Finish 30 runs as Ape Cat, 30 as BOGGY, and 30 as GIMBO. Other unlockable runners count after you unlock them.",
    skulls: 15,
    target: 30,
    read: (tally) =>
      crewProgress(tally, {
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
      }),
  },
  {
    id: "week-coins",
    period: "weekly",
    title: "Coin vault",
    detail: "Collect 25,000 $APECAT coins this week.",
    skulls: 15,
    target: 25000,
    read: (tally) => tally.coins,
  },
];

export type UnlockFlags = {
  pinky: boolean;
  koko: boolean;
  spooky: boolean;
  ramdawg: boolean;
  otter: boolean;
  figge: boolean;
  thehodlr: boolean;
  afterape: boolean;
  deadbeaver: boolean;
  quit: boolean;
  dupes: boolean;
  boggybond: boolean;
  gigatron: boolean;
};

/** Lowest finished-run count across the crew. Paid runners join after unlock. */
export function crewProgress(tally: Tally, unlocked: UnlockFlags) {
  const counts = [tally.rides.APECAT, tally.rides.BOGGY, tally.rides.GIMBO];
  if (unlocked.pinky) counts.push(tally.rides.PINKY);
  if (unlocked.koko) counts.push(tally.rides.KOKO);
  if (unlocked.spooky) counts.push(tally.rides.SPOOKY);
  if (unlocked.ramdawg) counts.push(tally.rides.RAMDAWG);
  if (unlocked.otter) counts.push(tally.rides.OTTER);
  if (unlocked.figge) counts.push(tally.rides.FIGGE);
  if (unlocked.thehodlr) counts.push(tally.rides.THEHODLR);
  if (unlocked.afterape) counts.push(tally.rides.AFTERAPE);
  if (unlocked.deadbeaver) counts.push(tally.rides.DEADBEAVER);
  if (unlocked.quit) counts.push(tally.rides.QUIT);
  if (unlocked.dupes) counts.push(tally.rides.DUPES);
  if (unlocked.boggybond) counts.push(tally.rides.BOGGYBOND);
  if (unlocked.gigatron) counts.push(tally.rides.GIGATRON);
  return Math.min(...counts);
}

export function crewDetail(unlocked: UnlockFlags) {
  const bits = ["30 as Ape Cat", "30 as BOGGY", "30 as GIMBO"];
  if (unlocked.pinky) bits.push(`30 as ${runnerLabel("PINKY")}`);
  if (unlocked.koko) bits.push(`30 as ${runnerLabel("KOKO")}`);
  if (unlocked.spooky) bits.push(`30 as ${runnerLabel("SPOOKY")}`);
  if (unlocked.ramdawg) bits.push(`30 as ${runnerLabel("RAMDAWG")}`);
  if (unlocked.otter) bits.push(`30 as ${runnerLabel("OTTER")}`);
  if (unlocked.figge) bits.push(`30 as ${runnerLabel("FIGGE")}`);
  if (unlocked.thehodlr) bits.push(`30 as ${runnerLabel("THEHODLR")}`);
  if (unlocked.afterape) bits.push(`30 as ${runnerLabel("AFTERAPE")}`);
  if (unlocked.deadbeaver) bits.push(`30 as ${runnerLabel("DEADBEAVER")}`);
  if (unlocked.quit) bits.push(`30 as ${runnerLabel("QUIT")}`);
  if (unlocked.dupes) bits.push(`30 as ${runnerLabel("DUPES")}`);
  if (unlocked.boggybond) bits.push(`30 as ${runnerLabel("BOGGYBOND")}`);
  if (unlocked.gigatron) bits.push(`30 as ${runnerLabel("GIGATRON")}`);
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
    rides: {
      APECAT: 0,
      BOGGY: 0,
      GIMBO: 0,
      PINKY: 0,
      KOKO: 0,
      SPOOKY: 0,
      RAMDAWG: 0,
      OTTER: 0,
      FIGGE: 0,
      THEHODLR: 0,
      AFTERAPE: 0,
      DEADBEAVER: 0,
      QUIT: 0,
      DUPES: 0,
      BOGGYBOND: 0,
      GIGATRON: 0,
    },
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
    ? row.runners.filter(
        (name): name is RunnerName =>
          name === "APECAT" ||
          name === "BOGGY" ||
          name === "GIMBO" ||
          name === "PINKY" ||
          name === "KOKO" ||
          name === "SPOOKY" ||
          name === "RAMDAWG" ||
          name === "OTTER" ||
          name === "FIGGE" ||
          name === "THEHODLR" ||
          name === "AFTERAPE" ||
          name === "DEADBEAVER" ||
          name === "QUIT" ||
          name === "DUPES" ||
          name === "BOGGYBOND" ||
          name === "GIGATRON",
      )
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
      SPOOKY: num(row.rides?.SPOOKY),
      RAMDAWG: num(row.rides?.RAMDAWG),
      OTTER: num(row.rides?.OTTER),
      FIGGE: num(row.rides?.FIGGE),
      THEHODLR: num(row.rides?.THEHODLR),
      AFTERAPE: num(row.rides?.AFTERAPE),
      DEADBEAVER: num(row.rides?.DEADBEAVER),
      QUIT: num(row.rides?.QUIT),
      DUPES: num(row.rides?.DUPES),
      BOGGYBOND: num(row.rides?.BOGGYBOND),
      GIGATRON: num(row.rides?.GIGATRON),
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
      spooky: parsed.spooky === true,
      ramdawg: parsed.ramdawg === true,
      otter: parsed.otter === true,
      figge: parsed.figge === true,
      thehodlr: parsed.thehodlr === true,
      afterape: parsed.afterape === true,
      deadbeaver: parsed.deadbeaver === true,
      quit: parsed.quit === true,
      dupes: parsed.dupes === true,
      boggybond: parsed.boggybond === true,
      gigatron: parsed.gigatron === true,
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

export function goalProgress(
  goal: Goal,
  tally: Tally,
  unlocked: UnlockFlags = {
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
  },
) {
  return Math.min(goal.target, Math.max(0, goalValue(goal, tally, unlocked)));
}

export function goalDone(
  goal: Goal,
  tally: Tally,
  unlocked: UnlockFlags = {
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
  },
) {
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
  spooky: boolean;
  ramdawg: boolean;
  otter: boolean;
  figge: boolean;
  thehodlr: boolean;
  afterape: boolean;
  deadbeaver: boolean;
  quit: boolean;
  dupes: boolean;
  boggybond: boolean;
  gigatron: boolean;
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
    spooky: snap.spooky === true,
    ramdawg: snap.ramdawg === true,
    otter: snap.otter === true,
    figge: snap.figge === true,
    thehodlr: snap.thehodlr === true,
    afterape: snap.afterape === true,
    deadbeaver: snap.deadbeaver === true,
    quit: snap.quit === true,
    dupes: snap.dupes === true,
    boggybond: snap.boggybond === true,
    gigatron: snap.gigatron === true,
    claims: Array.isArray(snap.paid) ? snap.paid.filter((claim) => typeof claim === "string") : [],
    daily: snap.daily,
    weekly: snap.weekly,
  };
  writeRaw(token, next);
  return next;
}
