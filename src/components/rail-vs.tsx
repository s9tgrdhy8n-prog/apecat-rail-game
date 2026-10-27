import { useEffect, useRef, useState } from "react";
import type { Hud, RailApi, RunnerName } from "@/game/types";
import { runnerLabel } from "@/game/runners";
import { useP2PRoom } from "@/lib/multiplayer";

type RosterEntry = { name: RunnerName; src: string };
const NAME_KEY = "apecat-rail-vs-name";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  let code = "";
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function loadName() {
  try {
    return localStorage.getItem(NAME_KEY)?.slice(0, 16) || "Fren";
  } catch {
    return "Fren";
  }
}

function grantRoster(api: RailApi, names: RunnerName[]) {
  const has = (name: RunnerName) => names.includes(name);
  api.setPinkyUnlocked(has("PINKY"));
  api.setKokoUnlocked(has("KOKO"));
  api.setSpookyUnlocked(has("SPOOKY"));
  api.setRamdawgUnlocked(has("RAMDAWG"));
  api.setOtterUnlocked(has("OTTER"));
  api.setFiggeUnlocked(has("FIGGE"));
  api.setThehodlrUnlocked(has("THEHODLR"));
  api.setAfterapeUnlocked(has("AFTERAPE"));
  api.setDeadbeaverUnlocked(has("DEADBEAVER"));
  api.setQuitUnlocked(has("QUIT"));
  api.setDupesUnlocked(has("DUPES"));
  api.setBoggybondUnlocked(has("BOGGYBOND"));
  api.setGigatronUnlocked(has("GIGATRON"));
  api.setGimbopopeUnlocked(has("GIMBOPOPE"));
  api.setGoldfingerUnlocked(has("GOLDFINGER"));
  api.setBeepleUnlocked(has("BEEPLE"));
  api.setSaintUnlocked(has("SAINT"));
  api.setDibsUnlocked(has("DIBS"));
  api.setSlimshadyUnlocked(has("SLIMSHADY"));
  api.setLilredmercyUnlocked(has("LILREDMERCY"));
  api.setBlacknicholsonUnlocked(has("BLACKNICHOLSON"));
  api.setGrimyfrankieUnlocked(has("GRIMYFRANKIE"));
  api.setDpuckUnlocked(has("DPUCK"));
  api.setRyoshipainUnlocked(has("RYOSHIPAIN"));
  api.setJafbotUnlocked(has("JAFBOT"));
  api.setJ4vanUnlocked(has("J4VAN"));
  api.setLampseternalUnlocked(has("LAMPSETERNAL"));
  api.setChrisUnlocked(has("CHRIS"));
  api.setBoggymosiacUnlocked(has("BOGGYMOSIAC"));
  api.setBoggyclausUnlocked(has("BOGGYCLAUS"));
  api.setBlackbullUnlocked(has("BLACKBULL"));
  api.setSoltrainUnlocked(has("SOLTRAIN"));
}

type LobbyMsg = { t: "lobby"; name: string; runner: RunnerName; ready: boolean; round: number };
type GoMsg = { t: "go"; seed: number; at: number; round: number };
type FinalMsg = { t: "final"; score: number; meters: number; round: number };
type TickMsg = { t: "tick"; score: number; meters: number };

function isRunner(value: unknown): value is RunnerName {
  return typeof value === "string" && value.length > 0;
}

export function RailVs({
  roster,
  hud,
  api,
  initialCode,
  onClose,
}: {
  roster: RosterEntry[];
  hud: Hud;
  api: RailApi | null;
  initialCode?: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(loadName);
  const [draft, setDraft] = useState(initialCode ?? "");
  const [room, setRoom] = useState<string | null>(initialCode ?? null);

  function remember(next: string) {
    const trimmed = next.trim().slice(0, 16) || "Fren";
    setName(trimmed);
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      /* private mode */
    }
  }

  function enter(code: string) {
    const next = cleanCode(code);
    if (next.length !== 4) return;
    const url = new URL(window.location.href);
    url.searchParams.set("vs", next);
    window.history.replaceState({}, "", url);
    setRoom(next);
  }

  if (!room) {
    return (
      <div className="rail-vs-card">
        <p className="rail-kicker">P2P Vs</p>
        <h2>Play a fren</h2>
        <p className="rail-lede">
          Each of you plays on your own screen. Same track. First wreck ends the round. Higher score takes it. First to 2.
        </p>
        <label className="rail-vs-name">
          <span className="rail-sub">Your name</span>
          <input
            value={name}
            maxLength={16}
            autoCapitalize="words"
            autoComplete="nickname"
            onChange={(e) => remember(e.target.value)}
          />
        </label>
        <button type="button" className="rail-start" onClick={() => enter(makeCode())}>
          Make a room
        </button>
        <form
          className="rail-vs-join"
          onSubmit={(e) => {
            e.preventDefault();
            enter(draft);
          }}
        >
          <input
            value={draft}
            placeholder="CODE"
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Room code"
            onChange={(e) => setDraft(cleanCode(e.target.value))}
          />
          <button type="submit" disabled={draft.length !== 4}>
            Join
          </button>
        </form>
        <button type="button" className="rail-text-btn" onClick={onClose}>
          Back to the rail
        </button>
      </div>
    );
  }

  return (
    <VsRoom
      key={`${room}:${name}`}
      code={room}
      name={name}
      roster={roster}
      hud={hud}
      api={api}
      onLeave={() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("vs");
        window.history.replaceState({}, "", url);
        setRoom(null);
        setDraft("");
      }}
      onClose={onClose}
    />
  );
}

function VsRoom({
  code,
  name,
  roster,
  hud,
  api,
  onLeave,
  onClose,
}: {
  code: string;
  name: string;
  roster: RosterEntry[];
  hud: Hud;
  api: RailApi | null;
  onLeave: () => void;
  onClose: () => void;
}) {
  const p2p = useP2PRoom({ room: code, name });
  const rosterKey = roster.map((runner) => runner.name).join(",");
  const names = rosterKey ? (rosterKey.split(",") as RunnerName[]) : [];
  const [mine, setMine] = useState<RunnerName>(names.includes("APECAT") ? "APECAT" : names[0] ?? "APECAT");
  const [ready, setReady] = useState(false);
  const [theirName, setTheirName] = useState("");
  const [theirRunner, setTheirRunner] = useState<RunnerName>("APECAT");
  const [theirReady, setTheirReady] = useState(false);
  const [oppScore, setOppScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<null | { mine: number; theirs: number; draw: boolean }>(null);
  const [wins, setWins] = useState({ me: 0, them: 0 });
  const hudRef = useRef(hud);
  hudRef.current = hud;
  const apiRef = useRef(api);
  apiRef.current = api;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const roundRef = useRef(1);
  const sentGo = useRef(false);
  const myFinal = useRef<number | null>(null);
  const theirFinal = useRef<number | null>(null);
  const settled = useRef(false);
  const winsRef = useRef(wins);
  winsRef.current = wins;
  const liveRef = useRef(false);
  const armTimer = useRef(0);
  const countTimer = useRef(0);
  const [playing, setPlaying] = useState(false);

  const connected = p2p.peers.filter((peer) => peer.connectionState === "connected");
  const seatIds = [p2p.selfId, ...connected.map((peer) => peer.id)].sort();
  const iAmExtra = seatIds.indexOf(p2p.selfId) > 1;
  const rivalId = seatIds.find((id) => id !== p2p.selfId);
  const rival =
    connected.find((peer) => peer.id === rivalId) ?? p2p.peers.find((peer) => peer.id === rivalId) ?? null;
  const linked = rival?.connectionState === "connected" && !iAmExtra;
  const railsReady = hud.phase === "menu" || hud.phase === "dead";

  useEffect(() => {
    return () => {
      window.clearTimeout(armTimer.current);
      window.clearInterval(countTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!api) return;
    grantRoster(api, names);
    api.setPad("none");
    return () => api.setPad("both");
  }, [api, rosterKey]);

  useEffect(() => {
    if (hud.phase === "run" || hud.phase === "dead") return;
    api?.pick(mine);
  }, [api, mine, hud.phase]);

  useEffect(() => {
    if (!linked) return;
    p2p.send({
      t: "lobby",
      name,
      runner: mine,
      ready,
      round: roundRef.current,
    } satisfies LobbyMsg);
  }, [linked, name, mine, ready, p2p.send]);

  useEffect(() => {
    return p2p.onMessage((from, data, channel) => {
      if (!rival || from !== rival.id) return;
      if (!data || typeof data !== "object") return;
      const msg = data as LobbyMsg | GoMsg | FinalMsg | TickMsg;
      if (channel === "state" && msg.t === "tick" && typeof msg.score === "number" && theirFinal.current == null) {
        setOppScore(msg.score);
        return;
      }
      if (channel !== "reliable") return;
      if (msg.t === "lobby" && msg.round === roundRef.current) {
        if (typeof msg.name === "string") setTheirName(msg.name);
        if (isRunner(msg.runner)) setTheirRunner(msg.runner);
        setTheirReady(Boolean(msg.ready));
      }
      if (msg.t === "go" && msg.round === roundRef.current && typeof msg.seed === "number" && typeof msg.at === "number") {
        arm(msg.seed, msg.at);
      }
      if (msg.t === "final" && msg.round === roundRef.current && typeof msg.score === "number") {
        theirFinal.current = msg.score;
        setOppScore(msg.score);
        if (myFinal.current == null && hudRef.current.phase === "run") {
          const snap = apiRef.current?.freezeScore();
          myFinal.current = snap?.score ?? hudRef.current.score;
          p2p.send({ t: "final", score: myFinal.current, meters: snap?.meters ?? 0, round: roundRef.current } satisfies FinalMsg);
        }
        finish();
      }
    });
  }, [p2p.onMessage, p2p.send, rival]);

  useEffect(() => {
    if (!linked || !ready || !theirReady || iAmExtra) return;
    if (selfIsGuest(p2p.selfId, rival?.id)) return;
    if (sentGo.current || liveRef.current || result) return;
    if (hud.phase === "run") return;
    sentGo.current = true;
    const seed = Math.floor(Math.random() * 0x100000000);
    const at = Date.now() + 3200;
    p2p.send({ t: "go", seed, at, round: roundRef.current } satisfies GoMsg);
    arm(seed, at);
  }, [linked, ready, theirReady, iAmExtra, p2p.selfId, p2p.send, rival?.id, hud.phase, result]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      if (hudRef.current.phase !== "run") return;
      p2p.broadcast({ t: "tick", score: hudRef.current.score, meters: hudRef.current.meters } satisfies TickMsg);
    }, 150);
    return () => window.clearInterval(id);
  }, [playing, p2p.broadcast]);

  useEffect(() => {
    if (!liveRef.current || hud.phase !== "dead") return;
    if (myFinal.current != null) return;
    myFinal.current = hud.score;
    p2p.send({ t: "final", score: hud.score, meters: hud.meters, round: roundRef.current } satisfies FinalMsg);
    finish();
  }, [hud.phase, hud.score, hud.meters, p2p.send]);

  function arm(seed: number, at: number) {
    if (liveRef.current) return;
    liveRef.current = true;
    setPlaying(true);
    setResult(null);
    myFinal.current = null;
    theirFinal.current = null;
    settled.current = false;
    setOppScore(0);
    apiRef.current?.setPad("both");
    apiRef.current?.pick(mineRef.current);
    const tick = () => {
      const left = Math.ceil((at - Date.now()) / 1000);
      setCount(left > 0 ? left : 0);
    };
    tick();
    window.clearInterval(countTimer.current);
    countTimer.current = window.setInterval(tick, 200);
    window.clearTimeout(armTimer.current);
    armTimer.current = window.setTimeout(() => {
      window.clearInterval(countTimer.current);
      setCount(0);
      apiRef.current?.pick(mineRef.current);
      apiRef.current?.startSeeded(seed);
    }, Math.max(0, at - Date.now()));
  }

  function finish() {
    if (settled.current) return;
    if (myFinal.current == null || theirFinal.current == null) return;
    settled.current = true;
    liveRef.current = false;
    setPlaying(false);
    window.clearInterval(countTimer.current);
    window.clearTimeout(armTimer.current);
    const mineScore = myFinal.current;
    const theirScore = theirFinal.current;
    const next = { me: winsRef.current.me, them: winsRef.current.them };
    if (mineScore > theirScore) next.me += 1;
    else if (theirScore > mineScore) next.them += 1;
    winsRef.current = next;
    setWins(next);
    setResult({ mine: mineScore, theirs: theirScore, draw: mineScore === theirScore });
    setReady(false);
    readyRef.current = false;
    setTheirReady(false);
    sentGo.current = false;
    roundRef.current += 1;
    apiRef.current?.setPad("none");
    p2p.send({
      t: "lobby",
      name,
      runner: mineRef.current,
      ready: false,
      round: roundRef.current,
    } satisfies LobbyMsg);
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("vs", code);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  function nextRound() {
    setResult(null);
    setReady(true);
  }

  const status = !p2p.joined
    ? "Opening the room…"
    : iAmExtra
      ? "This room already has two frens."
      : !rival
        ? "Waiting for your fren."
        : rival.connectionState === "failed"
          ? "Could not connect. Leave and make a new room."
          : linked
            ? theirReady && ready
              ? "Both ready. Starting…"
              : `${theirName || "Your fren"} is in.`
            : "Connecting…";

  const matchOver = wins.me >= 2 || wins.them >= 2;
  const them = theirName && theirName.toLowerCase() !== name.toLowerCase() ? theirName : "Your fren";
  const lead = !result
    ? ""
    : result.draw
      ? "Same score. This round does not count."
      : result.mine > result.theirs
        ? "You take the round."
        : `${them} takes the round.`;

  if ((hud.phase === "run" || count > 0) && !result) {
    return (
      <>
        <p className="rail-vs-chip">
          <span>{them}</span>
          <strong>{oppScore.toLocaleString()}</strong>
          <em>
            {wins.me}–{wins.them}
          </em>
        </p>
        {count > 0 ? (
          <div className="rail-duel-count">
            <strong>{count}</strong>
          </div>
        ) : null}
      </>
    );
  }

  if (playing && !result) {
    return (
      <div className="rail-vs-card">
        <p className="rail-kicker">Round</p>
        <h2>Round ending…</h2>
        <p className="rail-lede">Waiting on the other score.</p>
      </div>
    );
  }

  return (
    <div className="rail-vs-card">
      <p className="rail-kicker">Room</p>
      <p className="rail-vs-code">{code}</p>
      <div className="rail-vs-share">
        <button type="button" onClick={() => void copyLink()}>
          {copied ? "Link copied" : "Copy link"}
        </button>
        <button type="button" className="rail-text-btn" onClick={onLeave}>
          Leave room
        </button>
      </div>
      {result ? null : <p className="rail-lede">{status}</p>}
      {linked && !iAmExtra && result ? (
        <>
          <h2>{matchOver ? (wins.me > wins.them ? "You win the match." : `${them} wins the match.`) : lead}</h2>
          <p className="rail-duel-scores">
            <span>
              You <strong>{result.mine.toLocaleString()}</strong>
            </span>
            <span>
              {them} <strong>{result.theirs.toLocaleString()}</strong>
            </span>
          </p>
          <p className="rail-sub">
            Rounds {wins.me} – {wins.them}
          </p>
          {matchOver ? (
            <button type="button" className="rail-start" onClick={onClose}>
              Back to the rail
            </button>
          ) : (
            <button type="button" className="rail-start" onClick={nextRound}>
              {ready ? "Waiting for your fren" : "Next round"}
            </button>
          )}
        </>
      ) : null}
      {linked && !iAmExtra && !result ? (
        <>
          <div className="rail-duel-grid">
            <Picker
              label={name}
              roster={roster}
              value={mine}
              onPick={(runner) => {
                setMine(runner);
                setReady(false);
              }}
            />
            <div className="rail-duel-side">
              <p className="rail-kicker">{them}</p>
              <p className="rail-sub">{theirReady ? "Ready" : "Picking a runner"}</p>
              <p className="rail-vs-theirs">{runnerLabel(theirRunner)}</p>
            </div>
          </div>
          <button
            type="button"
            className="rail-start"
            disabled={!railsReady}
            onClick={() => setReady((on) => !on)}
          >
            {ready ? "Ready" : "I'm ready"}
          </button>
        </>
      ) : null}
      <button type="button" className="rail-text-btn" onClick={onClose}>
        Back to the rail
      </button>
    </div>
  );
}

function selfIsGuest(selfId: string, rivalId: string | undefined) {
  if (!rivalId) return true;
  return selfId > rivalId;
}

function Picker({
  label,
  roster,
  value,
  onPick,
}: {
  label: string;
  roster: RosterEntry[];
  value: RunnerName;
  onPick: (name: RunnerName) => void;
}) {
  return (
    <div className="rail-duel-side">
      <p className="rail-kicker">{label}</p>
      <div className="rail-duel-picks" role="group" aria-label={label}>
        {roster.map((runner) => (
          <button key={runner.name} type="button" className={runner.name === value ? "is-on" : ""} onClick={() => onPick(runner.name)}>
            <img src={runner.src} alt="" />
            <span>{runnerLabel(runner.name)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
