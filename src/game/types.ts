export type Phase = "loading" | "menu" | "run" | "dead";

export type RunnerName = "APECAT" | "BOGGY" | "GIMBO" | "PINKY" | "KOKO";

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
};

export type Nudge = -1 | 1 | "jump" | "slide";

export type RailApi = {
  start: () => void;
  kickMusic: () => void;
  toggleMute: () => void;
  toggleMusic: () => void;
  nudge: (dir: Nudge) => void;
  toMenu: () => void;
  swap: () => void;
  pick: (name: RunnerName) => void;
  noteBest: (score: number) => void;
  setPinkyUnlocked: (unlocked: boolean) => void;
  setKokoUnlocked: (unlocked: boolean) => void;
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
};
