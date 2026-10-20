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
  GIMBOPOPE: "Gimbo Pope",
  GOLDFINGER: "GoldFinger Gimbo",
  BEEPLE: "Beeple",
  SAINT: "Saint",
  DIBS: "DIBS",
  SLIMSHADY: "The real Slim Shady",
  LILREDMERCY: "lil red mercy",
  BLACKNICHOLSON: "BLACK NICHOLSON",
  GRIMYFRANKIE: "grimyfrankie.eth",
  DPUCK: "Dpuck \"bob\"",
  RYOSHIPAIN: "Ryoshi Pain",
  JAFBOT: "Jaf Bot",
  J4VAN: "j4van",
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
  BEEPLE: "beeple",
  SAINT: "Saint10Fourteen",
  DIBS: "DoinItBetterSan",
  SLIMSHADY: "slimshadygonwin",
  LILREDMERCY: "lilredmercy",
  BLACKNICHOLSON: "BlackNicholson9",
  GRIMYFRANKIE: "grimyfrankie",
  DPUCK: "Nfts4bob",
  RYOSHIPAIN: "Metasthetic",
  JAFBOT: "Jafisthebest",
  J4VAN: "money1xe",
};

export function runnerLabel(name: RunnerName | string) {
  return LABELS[name as RunnerName] ?? name;
}

export function runnerHandle(name: RunnerName | string) {
  return HANDLES[name as RunnerName] ?? "";
}
