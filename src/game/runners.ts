import type { RunnerName } from "@/game/types";

const LABELS: Record<RunnerName, string> = {
  APECAT: "Ape Cat",
  BOGGY: "BOGGY",
  GIMBO: "GIMBO",
  PINKY: "Pinky",
  KOKO: "KOKO",
  SPOOKY: "Spooky",
  RAMDAWG: "RamDawg",
  OTTER: "OTTER",
  FIGGE: "Figge",
  THEHODLR: "TheHoldr\u200bCollective",
  AFTERAPE: "AFTER APES",
  DEADBEAVER: "deadbeaver\u200b.eth",
};

const HANDLES: Partial<Record<RunnerName, string>> = {
  APECAT: "apecatsol",
  PINKY: "2577pink",
  KOKO: "Bayc364",
  SPOOKY: "SpookyB0nez",
  RAMDAWG: "Ramon_Pablo23",
  FIGGE: "mfigge",
  THEHODLR: "HodlrCollective",
  AFTERAPE: "AFTER_APES",
  DEADBEAVER: "Niffshockcollar",
};

export function runnerLabel(name: RunnerName | string) {
  return LABELS[name as RunnerName] ?? name;
}

export function runnerHandle(name: RunnerName | string) {
  return HANDLES[name as RunnerName] ?? "";
}
