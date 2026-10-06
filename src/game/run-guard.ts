/** Fastest the runner is allowed to move, matching SPEED_MAX in the track loop. */
export const SPEED_CAP = 40;

/**
 * One check-in can only bank a few seconds. A single request at the end of a
 * long wait cannot claim the whole wait.
 */
export const TICK_WINDOW_SEC = 3;

/**
 * Extra meters a live run can spend when a check-in arrives a little early.
 * Spent across the run, not granted again every second.
 */
export const RUN_SPARE = 360;

/** Richest pattern is 10 coins across a 15 m gap, plus the short intro. */
const COINS_NUM = 10;
const COINS_DEN = 15;
const INTRO_COINS = 12;

/** Slowest the runner moves once a run has started. */
export const SPEED_MIN = 18;

/** Each coin adds 10, 20, … or 100 points. A frame can be a step off. */
const POINTS_STEP = 10;
const POINTS_MAX = 100;
const POINT_SLACK = 40;

export function maxCoinsFor(meters: number) {
  const distance = Math.max(0, Math.floor(meters));
  return Math.floor((distance * COINS_NUM) / COINS_DEN) + INTRO_COINS;
}

export function metersGranted(heldMeters: number, gapSec: number, spare = 0) {
  const window = Math.min(TICK_WINDOW_SEC, Math.max(0, gapSec));
  const base = Math.max(0, Math.floor(heldMeters)) + Math.floor(SPEED_CAP * window) + 1;
  return base + Math.max(0, Math.floor(spare));
}

/** Spare left after a check-in that landed a bit ahead of the clock. */
export function spareAfter(heldMeters: number, gapSec: number, nextMeters: number, spare: number) {
  const base = metersGranted(heldMeters, gapSec, 0);
  const extra = Math.max(0, Math.floor(nextMeters) - base);
  return Math.max(0, Math.floor(spare) - extra);
}

/**
 * A run the server watched. If the last report is a little past the clock,
 * keep the watched distance and the coins that still fit it.
 */
export function fitWatchedRun(meters: number, coins: number, score: number, capMeters: number) {
  let useMeters = Math.max(0, Math.floor(meters));
  let useCoins = Math.max(0, Math.floor(coins));
  let useScore = Math.max(0, Math.floor(score));
  const cap = Math.max(0, Math.floor(capMeters));
  if (useMeters > cap) {
    useScore = Math.max(0, useScore - (useMeters - cap));
    useMeters = cap;
  }
  const coinCap = maxCoinsFor(useMeters);
  if (useCoins > coinCap) useCoins = coinCap;
  const maxPoints = useCoins === 0 ? 0 : useCoins * POINTS_MAX + POINT_SLACK;
  if (useScore - useMeters > maxPoints) useScore = useMeters + maxPoints;
  if (!scoreFits(useMeters, useCoins, useScore)) return null;
  return { meters: useMeters, coins: useCoins, score: useScore };
}

/**
 * Whole-run ceiling. A hot second can spike, but the posted total still has to
 * fit the time the server actually watched.
 */
export const SCORE_PER_SEC = 1200;
export const SCORE_BONUS = 300;

export function scoreWithinTime(score: number, elapsedSec: number) {
  const elapsed = Math.max(0, elapsedSec);
  return score <= Math.floor(elapsed * SCORE_PER_SEC) + SCORE_BONUS;
}

/**
 * Seconds that count. Only time where the run was moving, and never longer
 * than that distance can take at the slowest speed.
 */
export function activeSeconds(meters: number, banked: number, elapsed: number, tail: number) {
  const distanceCap = Math.max(0, meters) / SPEED_MIN + 8;
  return Math.min(Math.max(0, elapsed), Math.max(0, banked) + Math.max(0, tail), distanceCap);
}

/** True when this score is one the track could have produced for these totals. */
export function scoreFits(meters: number, coins: number, score: number) {
  if (!Number.isInteger(meters) || !Number.isInteger(coins) || !Number.isInteger(score)) return false;
  if (meters < 0 || coins < 0 || score < 0) return false;
  if (coins > maxCoinsFor(meters)) return false;
  const points = score - meters;
  if (points < -3) return false;
  if (coins === 0) return points <= 0;
  if (points < coins * POINTS_STEP - POINT_SLACK) return false;
  if (points > coins * POINTS_MAX + POINT_SLACK) return false;
  return true;
}
