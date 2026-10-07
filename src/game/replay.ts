import type { RunnerName } from "@/game/types";

const RUNNERS = new Set<RunnerName>([
  "APECAT",
  "BOGGY",
  "GIMBO",
  "PINKY",
  "KOKO",
  "SPOOKY",
  "RAMDAWG",
  "OTTER",
  "FIGGE",
  "THEHODLR",
]);

const KEYS = new Set([
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
  "ControlLeft",
]);

export type GhostEvent =
  | { t: number; k: "key"; code: string; down: boolean }
  | { t: number; k: "hold"; action: "jump" | "slide"; down: boolean }
  | { t: number; k: "nudge"; dir: -1 | 1 | "jump" | "slide" };

type StripTick<T> = T extends unknown ? Omit<T, "t"> : never;
export type GhostInput = StripTick<GhostEvent>;

export type GhostTape = {
  seed: number;
  runner: RunnerName;
  events: GhostEvent[];
};

const MAX_EVENTS = 8000;

/** Same seed, same track. Gameplay rolls use this. Camera shake does not. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function encodeGhost(tape: GhostTape) {
  return JSON.stringify({
    seed: tape.seed >>> 0,
    runner: tape.runner,
    events: tape.events.slice(0, MAX_EVENTS),
  });
}

export function decodeGhost(raw: string): GhostTape | null {
  if (!raw || raw.length > 120_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as { seed?: unknown; runner?: unknown; events?: unknown };
  const seed = Number(row.seed);
  if (!Number.isFinite(seed)) return null;
  if (typeof row.runner !== "string" || !RUNNERS.has(row.runner as RunnerName)) return null;
  if (!Array.isArray(row.events) || row.events.length > MAX_EVENTS) return null;
  const events: GhostEvent[] = [];
  for (const item of row.events) {
    const event = cleanEvent(item);
    if (!event) return null;
    events.push(event);
  }
  return { seed: seed >>> 0, runner: row.runner as RunnerName, events };
}

function cleanEvent(item: unknown): GhostEvent | null {
  if (!item || typeof item !== "object") return null;
  const row = item as { t?: unknown; k?: unknown; code?: unknown; down?: unknown; action?: unknown; dir?: unknown };
  const t = Math.floor(Number(row.t));
  if (!Number.isFinite(t) || t < 0 || t > 200_000) return null;
  if (row.k === "key") {
    if (typeof row.code !== "string" || !KEYS.has(row.code)) return null;
    return { t, k: "key", code: row.code, down: row.down === true };
  }
  if (row.k === "hold") {
    if (row.action !== "jump" && row.action !== "slide") return null;
    return { t, k: "hold", action: row.action, down: row.down === true };
  }
  if (row.k === "nudge") {
    if (row.dir !== -1 && row.dir !== 1 && row.dir !== "jump" && row.dir !== "slide") return null;
    return { t, k: "nudge", dir: row.dir };
  }
  return null;
}
