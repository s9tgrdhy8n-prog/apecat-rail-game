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
  QUIT: "Quit",
  DUPES: "Dupes",
  BOGGYBOND: "Boggy Bond",
  GIGATRON: "GIGATRON",
};

const HANDLES: Partial<Record<RunnerName, string>> = {
  APECAT: "apecatsol",
  BOGGY: "BoggyCoinSol",
  PINKY: "2577pink",
  KOKO: "Bayc364",
  SPOOKY: "SpookyB0nez",
  RAMDAWG: "Ramon_Pablo23",
  FIGGE: "mfigge",
  THEHODLR: "HodlrCollective",
  AFTERAPE: "AFTER_APES",
  DEADBEAVER: "Niffshockcollar",
  QUIT: "0xQuit",
  DUPES: "acdupes",
  BOGGYBOND: "BoggyCoinSol",
  GIGATRON: "web3smb",
};

export function runnerLabel(name: RunnerName | string) {
  return LABELS[name as RunnerName] ?? name;
}

export function runnerHandle(name: RunnerName | string) {
  return HANDLES[name as RunnerName] ?? "";
}
