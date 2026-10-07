import type { GhostTape } from "@/game/replay";

export type Phase = "loading" | "menu" | "run" | "dead" | "gallery" | "replay";

export type RunnerName = "APECAT" | "BOGGY" | "GIMBO" | "PINKY" | "KOKO" | "SPOOKY" | "RAMDAWG" | "OTTER" | "FIGGE" | "THEHODLR";

export type Hud = {
  phase: Phase;
  coins: number;
  meters: number;
  score: number;
  best: number;
  speed: number;
  muted: boolean;
  musicPaused: boolean;
  flash: string;
  buff: string;
  newBest: boolean;
  loadError: string;
  runner: RunnerName;
  runSerial: number;
  seconds: number;
  shields: number;
  magnets: number;
  surges: number;
  jumps: number;
  slides: number;
  maxCombo: number;
  /** Gallery speed step, 0 through 4. Unused on a scored run. */
  pace: number;
  paused: boolean;
  /** 3, 2, or 1 while a paused run is counting back in. Otherwise 0. */
  countdown: number;
  replayDone: boolean;
  /** Whole seconds left on Magnet. 0 when it is not active. */
  magnetLeft: number;
  /** Whole seconds left on Surge. 0 when it is not active. */
  surgeLeft: number;
};

export type Nudge = -1 | 1 | "jump" | "slide";

export type RailApi = {
  start: () => void;
  kickMusic: () => void;
  toggleMute: () => void;
  toggleMusic: () => void;
  nudge: (dir: Nudge) => void;
  hold: (action: "jump" | "slide", down: boolean) => void;
  toMenu: () => void;
  enterGallery: () => void;
  galleryPace: (dir: -1 | 1) => void;
  swap: () => void;
  pick: (name: RunnerName) => void;
  noteBest: (score: number) => void;
  setPinkyUnlocked: (unlocked: boolean) => void;
  setKokoUnlocked: (unlocked: boolean) => void;
  setSpookyUnlocked: (unlocked: boolean) => void;
  setRamdawgUnlocked: (unlocked: boolean) => void;
  setOtterUnlocked: (unlocked: boolean) => void;
  setFiggeUnlocked: (unlocked: boolean) => void;
  setThehodlrUnlocked: (unlocked: boolean) => void;
  pause: () => void;
  resume: () => void;
  playReplay: (tape: GhostTape) => void;
  takeGhost: () => GhostTape | null;
};

export const EMPTY_HUD: Hud = {
  phase: "loading",
  coins: 0,
  meters: 0,
  score: 0,
  best: 0,
  speed: 0,
  muted: false,
  musicPaused: false,
  flash: "",
  buff: "",
  newBest: false,
  loadError: "",
  runner: "APECAT",
  runSerial: 0,
  seconds: 0,
  shields: 0,
  magnets: 0,
  surges: 0,
  jumps: 0,
  slides: 0,
  maxCombo: 0,
  pace: 1,
  paused: false,
  countdown: 0,
  replayDone: false,
  magnetLeft: 0,
  surgeLeft: 0,
};
