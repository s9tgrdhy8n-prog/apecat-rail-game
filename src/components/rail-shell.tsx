import { useEffect, useRef, useState } from "react";
import { Pause, Play, Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { AchievementSheet } from "@/components/achievement-sheet";
import { adoptServerAchievements, FIGGE_COST, GOALS, KOKO_COST, OTTER_COST, PINKY_COST, RAMDAWG_COST, SPOOKY_COST, THEHODLR_COST, type AchievementSave, type AchievementSnapshot, type Goal } from "@/game/achievements";
import { EMPTY_HUD, type Hud, type Nudge, type RailApi, type RunnerName } from "@/game/types";
import { beginRun, claimName, EMPTY_SKULLS, getBoard, getGhost, getStats, loginName, recordPlay, setPassword as savePassword, submitRun, syncDiamonds, tickRun, unlockRunner, type BoardState, type RailStats, type SkullCounts } from "@/game/board";
import { encodeGhost } from "@/game/replay";
import { ensurePlayerToken, forgetPlayerToken } from "@/game/player-token";
import { GAME_VERSION } from "@/game/version";
const COIN_ICON = "/brand/apecat-coin-face.png";
const DIAMOND_ICON = "/brand/diamond-skull.png";
const DIAMOND_MARK = "/brand/diamond-skull-clear.png";

const SKULLS: { id: keyof SkullCounts; name: string; src: string; blurb: string }[] = [
  {
    id: "shield",
    name: "Shield",
    src: "/brand/skull-shield.png",
    blurb: "One free hit. It stays until that hit, and the rings circle you the whole time. That hit also clears Magnet and Surge.",
  },
  {
    id: "magnet",
    name: "Magnet",
    src: "/brand/skull-magnet.png",
    blurb: "Lasts 8 seconds. Grabs coins beside you, above you when you run under them, and below you when you jump over. Picking up another Magnet sets the clock back to 8. Stacks with Surge.",
  },
  {
    id: "surge",
    name: "Surge",
    src: "/brand/skull-surge.png",
    blurb: "Lasts 8 seconds and doubles coin points. Picking up another Surge sets the clock back to 8. Stacks with Magnet until a Shield hit.",
  },
];

function DiamondCollected({ count }: { count: number }) {
  return (
    <>
      <h3 className="rail-kicker">Diamond Skulls collected</h3>
      <ul className="rail-skulls">
        <li>
          <img className="rail-diamond-stat" src={DIAMOND_ICON} alt="" />
          <span>Diamond Skulls</span>
          <strong>{count.toLocaleString()}</strong>
        </li>
      </ul>
    </>
  );
}

function SkullCountsList({ counts }: { counts: SkullCounts }) {
  return (
    <ul className="rail-skulls">
      {SKULLS.map((skull) => (
        <li key={skull.id}>
          <img src={skull.src} alt="" />
          <span>{skull.name}</span>
          <strong>{counts[skull.id].toLocaleString()}</strong>
        </li>
      ))}
    </ul>
  );
}

const RUNNERS: { name: RunnerName; src: string }[] = [
  { name: "APECAT", src: "/brand/apecat.jpg" },
  { name: "BOGGY", src: "/brand/boggy.jpg" },
  { name: "GIMBO", src: "/brand/gimbo.jpg" },
  { name: "PINKY", src: "/brand/pinky.png" },
  { name: "KOKO", src: "/brand/koko.png" },
  { name: "SPOOKY", src: "/brand/spooky.png" },
  { name: "RAMDAWG", src: "/brand/ramdawg.png" },
  { name: "OTTER", src: "/brand/otter.png" },
  { name: "FIGGE", src: "/brand/figge.png" },
  { name: "THEHODLR", src: "/brand/thehodlr.png" },
];
const MOBILE_KEY = "apecat-rail-mobile";
const QUIET_KEY = "apecat-rail-quiet";

function formatPlay(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function RunnerTimes({ rows }: { rows: { name: string; seconds: number }[] }) {
  return (
    <div className="rail-runner-times">
      <dl className="rail-stats">
        {rows.map((row) => (
          <div key={row.name}>
            <dt>{row.name}</dt>
            <dd>{formatPlay(row.seconds)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function RailShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<RailApi | null>(null);
  const swipe = useRef<{
    x: number;
    y: number;
    id: number;
    held: "jump" | "slide" | null;
    used: boolean;
  } | null>(null);
  const jumpDown = useRef(false);
  const slideDown = useRef(false);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [token, setToken] = useState("");
  const [board, setBoard] = useState<BoardState | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsPane, setStatsPane] = useState<"global" | "personal" | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [achOpen, setAchOpen] = useState(false);
  const [ach, setAch] = useState<AchievementSave | null>(null);
  const [justEarned, setJustEarned] = useState<Goal[]>([]);
  const [pickupFill, setPickupFill] = useState(0);
  const [diamondPop, setDiamondPop] = useState(0);
  const [bankedThisRun, setBankedThisRun] = useState(0);
  const seenBundles = useRef(0);
  const [pinkyUnlocked, setPinkyUnlocked] = useState(false);
  const [kokoUnlocked, setKokoUnlocked] = useState(false);
  const [spookyUnlocked, setSpookyUnlocked] = useState(false);
  const [ramdawgUnlocked, setRamdawgUnlocked] = useState(false);
  const [otterUnlocked, setOtterUnlocked] = useState(false);
  const [figgeUnlocked, setFiggeUnlocked] = useState(false);
  const [thehodlrUnlocked, setThehodlrUnlocked] = useState(false);
  const [stats, setStats] = useState<RailStats | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [authMode, setAuthMode] = useState<"claim" | "login">("claim");
  const [nameError, setNameError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const posted = useRef(new Set<number>());
  const pinkyRef = useRef(false);
  const kokoRef = useRef(false);
  const spookyRef = useRef(false);
  const ramdawgRef = useRef(false);
  const otterRef = useRef(false);
  const figgeRef = useRef(false);
  const thehodlrRef = useRef(false);
  const settle = useRef<Promise<unknown>>(Promise.resolve());
  const arming = useRef(false);
  const hudRef = useRef(hud);
  hudRef.current = hud;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let dispose = () => {};
    void import("@/game/mount-rail").then(({ mountRail }) => {
      if (dead) return;
      const handle = mountRail(canvas, setHud);
      apiRef.current = handle.api;
      dispose = () => {
        handle.dispose();
        apiRef.current = null;
      };
    });
    return () => {
      dead = true;
      dispose();
    };
  }, [25]);

  function applyWallet(nextToken: string, res: AchievementSnapshot & { earned?: { id: string }[]; fill?: number }, runSerial = 0) {
    const save = adoptServerAchievements(nextToken, res);
    setAch(save);
    setPinkyUnlocked(save.pinky);
    pinkyRef.current = save.pinky;
    apiRef.current?.setPinkyUnlocked(save.pinky);
    setKokoUnlocked(save.koko);
    kokoRef.current = save.koko;
    apiRef.current?.setKokoUnlocked(save.koko);
    setSpookyUnlocked(save.spooky);
    spookyRef.current = save.spooky;
    apiRef.current?.setSpookyUnlocked(save.spooky);
    setRamdawgUnlocked(save.ramdawg);
    ramdawgRef.current = save.ramdawg;
    apiRef.current?.setRamdawgUnlocked(save.ramdawg);
    setOtterUnlocked(save.otter);
    otterRef.current = save.otter;
    apiRef.current?.setOtterUnlocked(save.otter);
    setFiggeUnlocked(save.figge);
    figgeRef.current = save.figge;
    apiRef.current?.setFiggeUnlocked(save.figge);
    setThehodlrUnlocked(save.thehodlr);
    thehodlrRef.current = save.thehodlr;
    apiRef.current?.setThehodlrUnlocked(save.thehodlr);
    if (typeof res.fill === "number") setPickupFill(Math.max(0, Math.min(99, Math.floor(res.fill))));
    if (runSerial > 0) {
      const live = hudRef.current;
      setBankedThisRun(live.shields + live.magnets + live.surges);
    }
    const earned = GOALS.filter((goal) => res.earned?.some((item) => item.id === goal.id));
    if (earned.length > 0) setJustEarned(earned);
  }

  useEffect(() => {
    const next = ensurePlayerToken();
    setToken(next);
    setPinkyUnlocked(false);
    pinkyRef.current = false;
    setKokoUnlocked(false);
    kokoRef.current = false;
    setSpookyUnlocked(false);
    spookyRef.current = false;
    setRamdawgUnlocked(false);
    ramdawgRef.current = false;
    setOtterUnlocked(false);
    otterRef.current = false;
    setFiggeUnlocked(false);
    figgeRef.current = false;
    setThehodlrUnlocked(false);
    thehodlrRef.current = false;
    void syncDiamonds({ data: { token: next } })
      .then((res) => {
        if (!res.daily) return;
        applyWallet(next, res);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    pinkyRef.current = pinkyUnlocked;
    apiRef.current?.setPinkyUnlocked(pinkyUnlocked);
  }, [pinkyUnlocked, hud.phase]);

  useEffect(() => {
    kokoRef.current = kokoUnlocked;
    apiRef.current?.setKokoUnlocked(kokoUnlocked);
  }, [kokoUnlocked, hud.phase]);

  useEffect(() => {
    spookyRef.current = spookyUnlocked;
    apiRef.current?.setSpookyUnlocked(spookyUnlocked);
  }, [spookyUnlocked, hud.phase]);

  useEffect(() => {
    ramdawgRef.current = ramdawgUnlocked;
    apiRef.current?.setRamdawgUnlocked(ramdawgUnlocked);
  }, [ramdawgUnlocked, hud.phase]);

  useEffect(() => {
    otterRef.current = otterUnlocked;
    apiRef.current?.setOtterUnlocked(otterUnlocked);
  }, [otterUnlocked, hud.phase]);

  useEffect(() => {
    figgeRef.current = figgeUnlocked;
    apiRef.current?.setFiggeUnlocked(figgeUnlocked);
  }, [figgeUnlocked, hud.phase]);

  useEffect(() => {
    thehodlrRef.current = thehodlrUnlocked;
    apiRef.current?.setThehodlrUnlocked(thehodlrUnlocked);
  }, [thehodlrUnlocked, hud.phase]);

  useEffect(() => {
    if (hud.phase === "run") setJustEarned([]);
  }, [hud.phase]);

  useEffect(() => {
    if (!token) return;
    let cancel = false;
    void getBoard({ data: { token } })
      .then((next) => {
        if (!cancel) setBoard(next);
      })
      .catch(() => {
        if (!cancel) setBoard({ name: null, hasPassword: false, rows: [], you: null });
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  useEffect(() => {
    if (hud.phase === "run") {
      setBoardOpen(false);
      setStatsOpen(false);
      setLegendOpen(false);
    }
  }, [hud.phase]);

  function enqueue(job: () => Promise<unknown>) {
    settle.current = settle.current.then(job, job);
  }

  useEffect(() => {
    if (hud.phase !== "run" || !token) return;
    let stopped = false;
    let chain = Promise.resolve();
    const send = () => {
      chain = chain.then(async () => {
        if (stopped) return;
        const live = hudRef.current;
        if (live.phase !== "run") return;
        await tickRun({
          data: {
            token,
            meters: live.meters,
            coins: live.coins,
            score: live.score,
            shields: live.shields,
            magnets: live.magnets,
            surges: live.surges,
          },
        }).catch(() => undefined);
      });
    };
    const first = window.setTimeout(send, 400);
    const id = window.setInterval(send, 1000);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [hud.phase, token]);

  function launch() {
    if (arming.current || hudRef.current.phase === "run") return;
    if (
      (hudRef.current.runner === "PINKY" && !pinkyRef.current) ||
      (hudRef.current.runner === "KOKO" && !kokoRef.current) ||
      (hudRef.current.runner === "SPOOKY" && !spookyRef.current) ||
      (hudRef.current.runner === "RAMDAWG" && !ramdawgRef.current) ||
      (hudRef.current.runner === "OTTER" && !otterRef.current) ||
      (hudRef.current.runner === "FIGGE" && !figgeRef.current) ||
      (hudRef.current.runner === "THEHODLR" && !thehodlrRef.current)
    ) {
      apiRef.current?.start();
      return;
    }
    arming.current = true;
    apiRef.current?.kickMusic();
    const runToken = token;
    enqueue(async () => {
      try {
        if (runToken) {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              const opened = await Promise.race([
                beginRun({ data: { token: runToken } }),
                new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4000)),
              ]);
              if (opened?.ok) break;
            } catch {
              /* the next attempt opens the run */
            }
          }
        }
        apiRef.current?.start();
      } finally {
        arming.current = false;
      }
    });
  }

  useEffect(() => {
    if (board?.you?.score == null) return;
    apiRef.current?.noteBest(board.you.score);
  }, [board?.you?.score]);

  const displayBest =
    board?.you != null ? Math.max(hud.best, board.you.score) : hud.best;

  const pickedNow = hud.shields + hud.magnets + hud.surges;
  const runPickups = hud.phase === "run" ? pickedNow : Math.max(0, pickedNow - bankedThisRun);
  const pickupRaw = pickupFill + runPickups;
  const meter = pickupRaw > 0 && pickupRaw % 100 === 0 ? 100 : pickupRaw % 100;

  useEffect(() => {
    seenBundles.current = 0;
  }, [hud.runSerial]);

  useEffect(() => {
    if (hud.phase !== "run" && hud.phase !== "dead") return;
    const gained = Math.floor(pickupRaw / 100);
    if (gained > seenBundles.current) {
      seenBundles.current = gained;
      setDiamondPop((n) => n + 1);
    }
  }, [hud.phase, pickupRaw]);

  useEffect(() => {
    if (!diamondPop) return;
    const id = window.setTimeout(() => setDiamondPop(0), 1700);
    return () => window.clearTimeout(id);
  }, [diamondPop]);

  useEffect(() => {
    if (!token || board === null || hud.phase !== "dead" || hud.runSerial === 0) return;
    if (posted.current.has(hud.runSerial)) return;
    posted.current.add(hud.runSerial);
    const runSerial = hud.runSerial;
    if (!board.name) {
      enqueue(() =>
        recordPlay({
          data: {
            token,
            runner: hud.runner,
            seconds: hud.seconds,
            score: hud.score,
            meters: hud.meters,
            coins: hud.coins,
            shields: hud.shields,
            magnets: hud.magnets,
            surges: hud.surges,
          },
        })
          .then((res) => {
            if (res.ok) applyWallet(token, res, runSerial);
          })
          .catch(() => {
            posted.current.delete(runSerial);
          }),
      );
      return;
    }
    enqueue(() =>
      submitRun({
        data: {
          token,
          score: hud.score,
          meters: hud.meters,
          coins: hud.coins,
          runner: hud.runner,
          seconds: hud.seconds,
          shields: hud.shields,
          magnets: hud.magnets,
          surges: hud.surges,
          ghost: (() => {
            const tape = apiRef.current?.takeGhost();
            return tape ? encodeGhost(tape) : "";
          })(),
        },
      })
        .then((res) => {
          if (res.ok) {
            setBoard(res.board);
            if (res.board.you) apiRef.current?.noteBest(res.board.you.score);
            if (res.daily) applyWallet(token, res, runSerial);
          }
        })
        .catch(() => {
          posted.current.delete(runSerial);
        }),
    );
  }, [token, board, hud.phase, hud.runSerial, hud.score, hud.meters, hud.coins, hud.runner, hud.seconds]);

  useEffect(() => {
    if (!statsOpen) return;
    let cancel = false;
    setStats(null);
    const emptySlice = {
      seconds: 0,
      runners: [
        { name: "APECAT" as const, seconds: 0 },
        { name: "BOGGY" as const, seconds: 0 },
        { name: "GIMBO" as const, seconds: 0 },
        { name: "PINKY" as const, seconds: 0 },
        { name: "KOKO" as const, seconds: 0 },
        { name: "SPOOKY" as const, seconds: 0 },
        { name: "RAMDAWG" as const, seconds: 0 },
        { name: "OTTER" as const, seconds: 0 },
        { name: "FIGGE" as const, seconds: 0 },
        { name: "THEHODLR" as const, seconds: 0 },
      ],
    };
    void (async () => getStats({ data: { token } }))()
      .then((next) => {
        if (!cancel) setStats(next);
      })
      .catch(() => {
        if (!cancel) {
          setStats({
            global: { players: 0, coins: 0, diamonds: 0, ...emptySlice, skulls: { ...EMPTY_SKULLS } },
            personal: { ...emptySlice, best: 0, coins: 0, rank: null, diamonds: 0, skulls: { ...EMPTY_SKULLS } },
          });
        }
      });
    return () => {
      cancel = true;
    };
  }, [statsOpen, token, ach]);

  function typed(e: React.FormEvent, field: string) {
    const form = e.currentTarget;
    if (!(form instanceof HTMLFormElement)) return "";
    const el = form.elements.namedItem(field);
    return el instanceof HTMLInputElement ? el.value : "";
  }

  async function onClaim(e: React.FormEvent) {
    e.preventDefault();
    const name = typed(e, "rider") || nameDraft;
    const pass = typed(e, "secret") || password;
    const again = typed(e, "secret2") || confirm;
    setClaiming(true);
    setNameError("");
    try {
      if (pass !== again) {
        setNameError("Passwords don’t match.");
        return;
      }
      const result = await claimName({ data: { token, name, password: pass } });
      if (!result.ok) {
        setNameError(result.error);
        return;
      }
      const next = await getBoard({ data: { token } });
      setBoard(next);
      setNameDraft("");
      setPassword("");
      setConfirm("");
      if (hud.phase === "dead" && hud.runSerial > 0 && !posted.current.has(hud.runSerial)) {
        posted.current.add(hud.runSerial);
        const postedRun = await submitRun({
          data: {
            token,
            score: hud.score,
            meters: hud.meters,
            coins: hud.coins,
            runner: hud.runner,
            seconds: hud.seconds,
            shields: hud.shields,
            magnets: hud.magnets,
            surges: hud.surges,
          },
        });
        if (postedRun.ok) {
          setBoard(postedRun.board);
          if (postedRun.daily) applyWallet(token, postedRun, hud.runSerial);
        }
      }
    } catch {
      setNameError("Couldn’t reach the rail. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    const name = typed(e, "rider") || nameDraft;
    const pass = typed(e, "secret") || password;
    setClaiming(true);
    setNameError("");
    try {
      const result = await loginName({ data: { token, name, password: pass } });
      if (!result.ok) {
        setNameError(result.error);
        return;
      }
      const next = await getBoard({ data: { token } });
      setBoard(next);
      setNameDraft("");
      setPassword("");
      setConfirm("");
      if (next.you) apiRef.current?.noteBest(next.you.score);
    } catch {
      setNameError("Couldn’t reach the rail. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault();
    const pass = typed(e, "secret") || password;
    const again = typed(e, "secret2") || confirm;
    setClaiming(true);
    setNameError("");
    try {
      if (pass !== again) {
        setNameError("Passwords don’t match.");
        return;
      }
      const result = await savePassword({ data: { token, password: pass } });
      if (!result.ok) {
        setNameError(result.error);
        return;
      }
      const next = await getBoard({ data: { token } });
      setBoard(next);
      setPassword("");
      setConfirm("");
    } catch {
      setNameError("Couldn’t reach the rail. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  function onLogout() {
    const next = forgetPlayerToken();
    setToken(next);
    setBoard(null);
    setNameDraft("");
    setPassword("");
    setConfirm("");
    setNameError("");
    setAuthMode("login");
  }

  function switchAuth(mode: "claim" | "login") {
    setAuthMode(mode);
    setNameError("");
    setPassword("");
    setConfirm("");
  }

  function onPointerDown(e: React.PointerEvent) {
    if (hud.phase === "gallery") return;
    if ((e.target as HTMLElement).closest("button, input, textarea, a, .rail-sheet, .rail-menu, .rail-dead, .rail-freeze")) return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId, held: null, used: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function recognizeSwipe(dx: number, dy: number) {
    const gesture = swipe.current;
    if (!gesture || gesture.used) return;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (ady >= 16 && ady > adx * 0.65) {
      gesture.used = true;
      gesture.held = dy > 0 ? "slide" : "jump";
      apiRef.current?.hold(gesture.held, true);
      return;
    }
    if (adx >= 20 && adx > ady) {
      gesture.used = true;
      apiRef.current?.nudge(dx > 0 ? 1 : -1);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const gesture = swipe.current;
    if (!gesture || gesture.id !== e.pointerId || gesture.used) return;
    recognizeSwipe(e.clientX - gesture.x, e.clientY - gesture.y);
  }

  function endSwipe(e: React.PointerEvent) {
    const gesture = swipe.current;
    if (!gesture || gesture.id !== e.pointerId) return;
    const startedBeforeUp = gesture.used;
    if (!gesture.used) recognizeSwipe(e.clientX - gesture.x, e.clientY - gesture.y);
    swipe.current = null;
    if (!gesture.held) return;
    const action = gesture.held;
    if (startedBeforeUp) apiRef.current?.hold(action, false);
    else {
      apiRef.current?.hold(action, false);
      apiRef.current?.nudge(action);
    }
  }

  function pressAction(action: "jump" | "slide", down: boolean) {
    return (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const flag = action === "jump" ? jumpDown : slideDown;
      if (down) {
        if (flag.current) return;
        flag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        apiRef.current?.hold(action, true);
        return;
      }
      if (!flag.current) return;
      flag.current = false;
      apiRef.current?.hold(action, false);
    };
  }

  useEffect(() => {
    if (hud.phase === "run") return;
    jumpDown.current = false;
    slideDown.current = false;
  }, [hud.phase]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MOBILE_KEY);
      if (saved === "1" || saved === "0") setMobile(saved === "1");
      else setMobile(window.matchMedia("(pointer: coarse)").matches);
      setQuiet(localStorage.getItem(QUIET_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);

  function chooseQuiet() {
    setQuiet((on) => {
      const next = !on;
      try {
        localStorage.setItem(QUIET_KEY, next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  }

  function chooseControls(next: boolean) {
    setMobile(next);
    try {
      localStorage.setItem(MOBILE_KEY, next ? "1" : "0");
    } catch {
      /* private mode */
    }
  }

  function controlPick() {
    return (
      <div className="rail-modes" role="group" aria-label="Controls">
        <button type="button" className={mobile ? "" : "is-on"} onClick={() => chooseControls(false)}>
          Keyboard
        </button>
        <button type="button" className={mobile ? "is-on" : ""} onClick={() => chooseControls(true)}>
          Mobile
        </button>
      </div>
    );
  }
  async function onUnlockPinky() {
    if (!token || pinkyUnlocked) return;
    if ((ach?.skulls ?? 0) < PINKY_COST) return;
    const res = await unlockRunner({ data: { token, runner: "PINKY" } }).catch(() => null);
    if (res?.ok && res.daily) applyWallet(token, res);
  }

  async function onUnlockKoko() {
    if (!token || kokoUnlocked) return;
    if ((ach?.skulls ?? 0) < KOKO_COST) return;
    const res = await unlockRunner({ data: { token, runner: "KOKO" } }).catch(() => null);
    if (res?.ok && res.daily) applyWallet(token, res);
  }

  async function onUnlockSpooky() {
    if (!token || spookyUnlocked) return;
    if ((ach?.skulls ?? 0) < SPOOKY_COST) return;
    const res = await unlockRunner({ data: { token, runner: "SPOOKY" } }).catch(() => null);
    if (res?.ok && res.daily) applyWallet(token, res);
  }

  async function onUnlockRamdawg() {
    if (!token || ramdawgUnlocked) return;
    if ((ach?.skulls ?? 0) < RAMDAWG_COST) return;
    const res = await unlockRunner({ data: { token, runner: "RAMDAWG" } }).catch(() => null);
    if (res?.ok && res.daily) applyWallet(token, res);
  }

  async function onUnlockOtter() {
    if (!token || otterUnlocked) return;
    if ((ach?.skulls ?? 0) < OTTER_COST) return;
    const res = await unlockRunner({ data: { token, runner: "OTTER" } }).catch(() => null);
    if (res?.ok && res.daily) applyWallet(token, res);
  }

  async function onUnlockFigge() {
    if (!token || figgeUnlocked) return;
    if ((ach?.skulls ?? 0) < FIGGE_COST) return;
    const res = await unlockRunner({ data: { token, runner: "FIGGE" } }).catch(() => null);
    if (res?.ok && res.daily) applyWallet(token, res);
  }

  async function onUnlockThehodlr() {
    if (!token || thehodlrUnlocked) return;
    if ((ach?.skulls ?? 0) < THEHODLR_COST) return;
    const res = await unlockRunner({ data: { token, runner: "THEHODLR" } }).catch(() => null);
    if (res?.ok && res.daily) applyWallet(token, res);
  }

  function picks() {
    return (
      <div className="rail-picks" role="group" aria-label="Runners">
        {RUNNERS.map((runner) => {
          const locked =
            (runner.name === "PINKY" && !pinkyUnlocked) ||
            (runner.name === "KOKO" && !kokoUnlocked) ||
            (runner.name === "SPOOKY" && !spookyUnlocked) ||
            (runner.name === "RAMDAWG" && !ramdawgUnlocked) ||
            (runner.name === "OTTER" && !otterUnlocked) ||
            (runner.name === "FIGGE" && !figgeUnlocked) ||
            (runner.name === "THEHODLR" && !thehodlrUnlocked);
          const cost =
            runner.name === "KOKO"
              ? KOKO_COST
              : runner.name === "SPOOKY"
                ? SPOOKY_COST
                : runner.name === "RAMDAWG"
                  ? RAMDAWG_COST
                  : runner.name === "OTTER"
                  ? OTTER_COST
                  : runner.name === "FIGGE"
                    ? FIGGE_COST
                    : runner.name === "THEHODLR"
                      ? THEHODLR_COST
                      : PINKY_COST;
          return (
            <button
              key={runner.name}
              type="button"
              className={runner.name === hud.runner ? (locked ? "is-on is-locked" : "is-on") : locked ? "is-locked" : ""}
              aria-label={locked ? `${runner.name} locked` : runner.name}
              aria-pressed={runner.name === hud.runner}
              onClick={() => apiRef.current?.pick(runner.name)}
            >
              <img src={runner.src} alt="" />
              <span>{runner.name}</span>
              {locked ? (
                <em>
                  <img src={DIAMOND_MARK} alt="" />
                  {cost}
                </em>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  function passwordFields(confirmToo: boolean) {
    return (
      <>
        <label>
          <span className="sr-only">Password</span>
          <input
            name="secret"
            type="password"
            maxLength={64}
            autoComplete={confirmToo ? "new-password" : "current-password"}
            placeholder="PASSWORD"
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
        </label>
        {confirmToo ? (
          <label>
            <span className="sr-only">Confirm password</span>
            <input
              name="secret2"
              type="password"
              maxLength={64}
              autoComplete="new-password"
              placeholder="CONFIRM PASSWORD"
              onInput={(e) => setConfirm(e.currentTarget.value)}
            />
          </label>
        ) : null}
      </>
    );
  }

  function nameSlot() {
    if (!token || board === null) return <p className="rail-sub">Checking the rail…</p>;
    if (board.name) {
      return (
        <div className="rail-claim">
          <p className="rail-name">
            Riding as <strong>{board.name}</strong>
          </p>
          {board.hasPassword ? null : (
            <form className="rail-claim" onSubmit={onSetPassword}>
              <span className="rail-sub">Add a password so you can log back into this name.</span>
              {passwordFields(true)}
              <button type="submit" disabled={claiming || !token}>
                {claiming ? "Saving…" : "Save password"}
              </button>
              {nameError ? <p className="rail-name-error">{nameError}</p> : null}
            </form>
          )}
          <button type="button" className="rail-text-btn" onClick={onLogout}>
            Log out
          </button>
        </div>
      );
    }
    if (authMode === "login") {
      return (
        <form className="rail-claim" onSubmit={onLogin}>
          <label>
            <span className="rail-sub">Log in to pick up your name and scores.</span>
            <input
              name="rider"
              value={nameDraft}
              maxLength={16}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              placeholder="YOUR NAME"
              onChange={(e) => setNameDraft(e.target.value)}
              onInput={(e) => setNameDraft(e.currentTarget.value)}
            />
          </label>
          {passwordFields(false)}
          <button type="submit" disabled={claiming || !token}>
            {claiming ? "Logging in…" : "Log in"}
          </button>
          {nameError ? <p className="rail-name-error">{nameError}</p> : null}
          <button type="button" className="rail-text-btn" onClick={() => switchAuth("claim")}>
            Need a name? Claim one
          </button>
        </form>
      );
    }
    return (
      <form className="rail-claim" onSubmit={onClaim}>
        <label>
          <span className="rail-sub">Claim a name and password. Nobody else can take the name.</span>
          <input
            name="rider"
            value={nameDraft}
            maxLength={16}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            placeholder="YOUR NAME"
            onChange={(e) => setNameDraft(e.target.value)}
            onInput={(e) => setNameDraft(e.currentTarget.value)}
          />
        </label>
        {passwordFields(true)}
        <button type="submit" disabled={claiming || !token}>
          {claiming ? "Claiming…" : "Claim"}
        </button>
        {nameError ? <p className="rail-name-error">{nameError}</p> : null}
        <button type="button" className="rail-text-btn" onClick={() => switchAuth("login")}>
          Already have a name? Log in
        </button>
      </form>
    );
  }

  const showHud = hud.phase === "run" || hud.phase === "dead" || hud.phase === "replay";

  async function watchReplay(name: string) {
    const tape = await getGhost({ data: { name } }).catch(() => null);
    if (!tape) return;
    setBoardOpen(false);
    apiRef.current?.playReplay(tape);
  }

  return (
    <div
      className="rail-root"
      data-phase={hud.phase}
      data-mobile={mobile ? "1" : "0"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endSwipe}
      onPointerCancel={endSwipe}
    >
      <canvas ref={canvasRef} className="rail-canvas" />
      <div className="rail-vignette" />

      {showHud ? (
        <div className="rail-hud">
          <div className="rail-stat rail-stat-coins" aria-label={`${hud.coins} $APECAT COIN collected`}>
            <img className="rail-coin-icon" src={COIN_ICON} alt="" />
            <strong>{hud.coins}</strong>
          </div>
          <div className="rail-stat rail-stat-mid">
            <strong>{hud.meters}m</strong>
            <span>{hud.score.toLocaleString()} pts</span>
            <span className="rail-buff-row">
                {hud.buff ? (
                  <span className="rail-buffs">
                    {hud.buff
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((bit) => (
                        <span
                          key={bit}
                          className="rail-buff"
                          data-buff={bit.startsWith("x") ? "combo" : bit.toLowerCase()}
                        >
                          {bit}
                          {bit === "MAGNET" && hud.magnetLeft > 0 ? ` ${hud.magnetLeft}` : ""}
                          {bit === "SURGE" && hud.surgeLeft > 0 ? ` ${hud.surgeLeft}` : ""}
                        </span>
                      ))}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={quiet ? "rail-quiet is-on" : "rail-quiet"}
                  aria-pressed={quiet}
                  aria-label={quiet ? "Show collect notices" : "Hide collect notices"}
                  onClick={chooseQuiet}
                >
                  {quiet ? <BellOff size={14} /> : <Bell size={14} />}
                </button>
              </span>
          </div>
          <div className="rail-stat rail-stat-end">
            <span>Best</span>
            <strong>{displayBest.toLocaleString()}</strong>
          </div>
        </div>
      ) : null}

      {showHud ? <div className="rail-picks rail-picks-bar">{picks()}</div> : null}

      {hud.flash && !(quiet && hud.flash.includes("COLLECTED")) ? (
        <div
          className={hud.flash.includes("COLLECTED") ? "rail-flash is-pickup" : "rail-flash"}
          data-pickup={hud.flash.split(" ")[0]}
        >
          {hud.flash}
        </div>
      ) : null}

      {hud.phase === "run" || hud.phase === "dead" ? (
        <div className="rail-diamond-meter" aria-label={`${meter} of 100 power skulls toward a Diamond Skull`}>
          <img src={DIAMOND_MARK} alt="" />
          <div className="rail-diamond-meter-track">
            <span style={{ width: `${meter}%` }} />
          </div>
          <em>{meter}/100</em>
        </div>
      ) : null}

      {diamondPop > 0 && !quiet ? (
        <div className="rail-diamond-pop" key={diamondPop}>
          <img src={DIAMOND_MARK} alt="" />
          <strong>Diamond Skull +1</strong>
        </div>
      ) : null}

      {hud.phase === "loading" ? (
        <div className="rail-menu">
          <div className="rail-card">
            <p className="rail-kicker">Solana subway</p>
            <h1 className="rail-title">
              APECAT
              <br />
              <em>RAIL</em>
            </h1>
            <p className="rail-lede">{hud.loadError || "Suiting up the runners…"}</p>
          </div>
        </div>
      ) : null}

      {hud.phase === "menu" ? (
        <div className="rail-menu">
          <div className="rail-card">
            <p className="rail-kicker">Solana subway</p>
            <h1 className="rail-title">
              APECAT
              <br />
              <em>RAIL</em>
            </h1>
            <p className="rail-version">Version {GAME_VERSION}</p>
            <p className="rail-lede rail-lede-hot">
              {hud.runner === "BOGGY"
                ? "Boggy takes the tunnel. "
                : hud.runner === "GIMBO"
                  ? "Gimbo takes the tunnel. "
                  : hud.runner === "PINKY"
                    ? "Pinky takes the tunnel. "
                    : hud.runner === "KOKO"
                      ? "Koko takes the tunnel. "
                      : hud.runner === "SPOOKY"
                        ? "Spooky takes the tunnel. "
                        : hud.runner === "RAMDAWG"
                          ? "Ramdawg takes the tunnel. "
                          : hud.runner === "OTTER"
                            ? "Otter takes the tunnel. "
                            : hud.runner === "FIGGE"
                              ? "Figge takes the tunnel. "
                              : hud.runner === "THEHODLR"
                                ? "Thehodlr takes the tunnel. "
                                : "APECAT takes the tunnel. "}
              {(hud.runner === "PINKY" && !pinkyUnlocked) ||
              (hud.runner === "KOKO" && !kokoUnlocked) ||
              (hud.runner === "SPOOKY" && !spookyUnlocked) ||
              (hud.runner === "RAMDAWG" && !ramdawgUnlocked) ||
              (hud.runner === "OTTER" && !otterUnlocked) ||
              (hud.runner === "FIGGE" && !figgeUnlocked) ||
              (hud.runner === "THEHODLR" && !thehodlrUnlocked)
                ? "Unlock for 169 Diamond Skulls."
                : "Get the highest score. Don’t kiss the bears."}
            </p>
            <button
              type="button"
              className="rail-start"
              onClick={launch}
            >
              Start
            </button>
            {nameSlot()}
            <div className="rail-action-stack">
              <button type="button" className="rail-board-btn" onClick={() => setBoardOpen(true)}>
                Leaderboard
              </button>
              <button
                type="button"
                className="rail-stats-btn"
                onClick={() => {
                  setStatsPane(null);
                  setStatsOpen(true);
                }}
              >
                Stats
              </button>
              <button type="button" className="rail-stats-btn" onClick={() => setLegendOpen(true)}>
                Legend
              </button>
              <button type="button" className="rail-stats-btn" onClick={() => apiRef.current?.enterGallery()}>
                Gallery
              </button>
              <div className="rail-achieve-row">
                <button type="button" className="rail-stats-btn" onClick={() => setAchOpen(true)}>
                  Achievements
                </button>
                <p className="rail-wallet" aria-label={`${ach?.skulls ?? 0} Diamond Skulls in inventory`}>
                  <img src={DIAMOND_ICON} alt="" />
                  <strong>{(ach?.skulls ?? 0).toLocaleString()}</strong>
                </p>
              </div>
            </div>
            {picks()}
            {hud.runner === "PINKY" && !pinkyUnlocked ? (
              <button type="button" className="rail-stats-btn" onClick={onUnlockPinky}>
                {(ach?.skulls ?? 0) >= PINKY_COST ? "Unlock Pinky · 169" : "Need 169 Diamond Skulls"}
              </button>
            ) : null}
            {hud.runner === "KOKO" && !kokoUnlocked ? (
              <button type="button" className="rail-stats-btn" onClick={onUnlockKoko}>
                {(ach?.skulls ?? 0) >= KOKO_COST ? "Unlock Koko · 169" : "Need 169 Diamond Skulls"}
              </button>
            ) : null}
            {hud.runner === "SPOOKY" && !spookyUnlocked ? (
              <button type="button" className="rail-stats-btn" onClick={onUnlockSpooky}>
                {(ach?.skulls ?? 0) >= SPOOKY_COST ? "Unlock Spooky · 169" : "Need 169 Diamond Skulls"}
              </button>
            ) : null}
            {hud.runner === "RAMDAWG" && !ramdawgUnlocked ? (
              <button type="button" className="rail-stats-btn" onClick={onUnlockRamdawg}>
                {(ach?.skulls ?? 0) >= RAMDAWG_COST ? "Unlock Ramdawg · 169" : "Need 169 Diamond Skulls"}
              </button>
            ) : null}
            {hud.runner === "OTTER" && !otterUnlocked ? (
              <button type="button" className="rail-stats-btn" onClick={onUnlockOtter}>
                {(ach?.skulls ?? 0) >= OTTER_COST ? "Unlock Otter · 169" : "Need 169 Diamond Skulls"}
              </button>
            ) : null}
            {hud.runner === "FIGGE" && !figgeUnlocked ? (
              <button type="button" className="rail-stats-btn" onClick={onUnlockFigge}>
                {(ach?.skulls ?? 0) >= FIGGE_COST ? "Unlock Figge · 169" : "Need 169 Diamond Skulls"}
              </button>
            ) : null}
            {hud.runner === "THEHODLR" && !thehodlrUnlocked ? (
              <button type="button" className="rail-stats-btn" onClick={onUnlockThehodlr}>
                {(ach?.skulls ?? 0) >= THEHODLR_COST ? "Unlock Thehodlr · 169" : "Need 169 Diamond Skulls"}
              </button>
            ) : null}
            {mobile ? null : (
              <ul className="rail-hints">
              <li>
                <kbd>A</kbd>
                <kbd>D</kbd> lanes
              </li>
              <li>
                <kbd>W</kbd> jump
              </li>
              <li>
                <kbd>S</kbd> slide
              </li>
              <li>
                <kbd>Tab</kbd> switch
              </li>
              <li>
                <kbd>Esc</kbd> pause
              </li>
              <li>orbs · sliding bears</li>
            </ul>
            )}
            {displayBest > 0 ? <p className="rail-sub">Best {displayBest.toLocaleString()}</p> : null}
            <div className="rail-socials">
              <a className="rail-credit" href="https://x.com/ShadyLampX" target="_blank" rel="noreferrer">
                <img src="/brand/shady-lamp.jpg" alt="Wizard bull with Ape the Cat" />
                <span>@ShadyLampX</span>
              </a>
              <div className="rail-credit">
                <a href="https://x.com/apecatsol" target="_blank" rel="noreferrer">
                  <img className="rail-credit-wide" src="/brand/apecatsol.jpg" alt="Ape the Cat on the yacht" />
                  <span>@Apecatsol</span>
                </a>
                <a href="https://apecat.lol" target="_blank" rel="noreferrer">
                  apecat.lol
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {hud.phase === "dead" ? (
        <div className="rail-dead">
          <div className="rail-card">
            {hud.newBest ? <p className="rail-badge">NEW BEST</p> : <p className="rail-kicker">Clipped</p>}
            {justEarned.length > 0 ? (
              <p className="rail-badge rail-badge-crystal">
                +{justEarned.reduce((sum, goal) => sum + goal.skulls, 0)} Diamond Skulls
              </p>
            ) : null}
            <h2 className="rail-title">{hud.newBest ? "CLEAN" : "WRECKED"}</h2>
            <div className="rail-scoreline">
              <p>
                <span className="rail-sub">Score</span>
                <strong>{hud.score.toLocaleString()}</strong>
              </p>
              <p>
                <span className="rail-sub">$APECAT COIN</span>
                <strong>{hud.coins}</strong>
              </p>
              <p>
                <span className="rail-sub">Run</span>
                <strong>{hud.meters}m</strong>
              </p>
            </div>
            <div className="rail-dead-actions">
              <button type="button" className="rail-again" onClick={launch}>
                Run it back
              </button>
              <button type="button" className="rail-menu-btn" onClick={() => apiRef.current?.toMenu()}>
                Menu
              </button>
            </div>
            {displayBest > 0 ? <p className="rail-sub">Best {displayBest.toLocaleString()}</p> : null}
            {board?.you ? (
              <p className="rail-sub">
                {board.you.rank ? `Rail rank ${board.you.rank} · ` : ""}best {displayBest.toLocaleString()}
              </p>
            ) : (
              nameSlot()
            )}
            <div className="rail-action-stack">
              <button type="button" className="rail-board-btn" onClick={() => setBoardOpen(true)}>
                Leaderboard
              </button>
              <button
                type="button"
                className="rail-stats-btn"
                onClick={() => {
                  setStatsPane(null);
                  setStatsOpen(true);
                }}
              >
                Stats
              </button>
              <button type="button" className="rail-stats-btn" onClick={() => setLegendOpen(true)}>
                Legend
              </button>
              <button type="button" className="rail-stats-btn" onClick={() => setAchOpen(true)}>
                Achievements
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {achOpen && ach ? (
        <AchievementSheet save={ach} onClose={() => setAchOpen(false)} />
      ) : null}

      {legendOpen ? (
        <div className="rail-sheet">
          <div className="rail-card rail-board rail-legend">
            <div className="rail-board-head">
              <p className="rail-kicker">Legend</p>
              <button type="button" onClick={() => setLegendOpen(false)}>
                Close
              </button>
            </div>
            <section className="rail-stats-block">
              <h3 className="rail-kicker">The run</h3>
              <p className="rail-sub">
                Ride the tunnel. Switch lanes, jump the low bears, slide under the signs. Touch a bear and the run ends.
              </p>
            </section>
            <section className="rail-stats-block">
              <h3 className="rail-kicker">Points</h3>
              <dl className="rail-stats">
                <div>
                  <dt>Each meter</dt>
                  <dd>1</dd>
                </div>
                <div>
                  <dt>$APECAT COIN</dt>
                  <dd>10</dd>
                </div>
                <div>
                  <dt>Combo, every 4 coins</dt>
                  <dd>up to x5</dd>
                </div>
                <div>
                  <dt>Surge skull</dt>
                  <dd>doubles points for 8 seconds</dd>
                </div>
                <div>
                  <dt>Best coin</dt>
                  <dd>100</dd>
                </div>
              </dl>
              <p className="rail-sub">
                Your score is the meters plus the coin points. Let the coins lapse and the combo falls back to x1.
              </p>
            </section>
            <section className="rail-stats-block">
              <h3 className="rail-kicker">Skulls</h3>
              <ul className="rail-skull-legend">
                {SKULLS.map((skull) => (
                  <li key={skull.id}>
                    <img src={skull.src} alt="" />
                    <div>
                      <strong>{skull.name}</strong>
                      <p>{skull.blurb}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rail-stats-block">
              <h3 className="rail-kicker">Diamond Skulls</h3>
              <ul className="rail-skull-legend">
                <li>
                  <img className="rail-diamond-stat" src={DIAMOND_ICON} alt="" />
                  <div>
                    <strong>Diamond Skulls</strong>
                    <p>Finish daily and weekly achievements to earn Diamond Skulls. Every 100 Shield, Magnet, and Surge skulls together also earn one. They unlock playable characters.</p>
                  </div>
                </li>
              </ul>
            </section>
            <p className="rail-sub">Claim a name and your best earned score is the one that ranks.</p>
          </div>
        </div>
      ) : null}

      {statsOpen ? (
        <div className="rail-sheet">
          {stats === null ? (
            <div className="rail-card rail-board">
              <div className="rail-board-head">
                <p className="rail-kicker">Rail stats</p>
                <button type="button" onClick={() => setStatsOpen(false)}>
                  Close
                </button>
              </div>
              <p className="rail-sub">Counting the rail…</p>
            </div>
          ) : (
            <div className="rail-stats-windows" data-pane={statsPane ?? ""}>
              <div className="rail-stats-switch">
                <div className="rail-stats-switch-row">
                  <button
                    type="button"
                    className={statsPane === "global" ? "is-on" : ""}
                    onClick={() => setStatsPane("global")}
                  >
                    Global
                  </button>
                  <button
                    type="button"
                    className={statsPane === "personal" ? "is-personal is-on" : "is-personal"}
                    onClick={() => setStatsPane("personal")}
                  >
                    Personal
                  </button>
                </div>
                <button type="button" className="rail-stats-switch-close" onClick={() => setStatsOpen(false)}>
                  Close
                </button>
              </div>
              <section className="rail-card rail-board rail-stats-window">
                <div className="rail-board-head">
                  <p className="rail-kicker">Global stats</p>
                  <button type="button" onClick={() => setStatsOpen(false)}>
                    Close
                  </button>
                </div>
                <dl className="rail-stats">
                  <div>
                    <dt>Players, all time</dt>
                    <dd>{stats.global.players.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Time played, all time</dt>
                    <dd>{formatPlay(stats.global.seconds)}</dd>
                  </div>
                  <div>
                    <dt>Total coins collected</dt>
                    <dd>{stats.global.coins.toLocaleString()}</dd>
                  </div>
                </dl>
                <RunnerTimes rows={stats.global.runners} />
                <h3 className="rail-kicker">Skulls collected, all time</h3>
                <SkullCountsList counts={stats.global.skulls} />
                <DiamondCollected count={stats.global.diamonds} />
              </section>
              <section className="rail-card rail-board rail-stats-window rail-stats-personal">
                <div className="rail-board-head">
                  <p className="rail-kicker">Personal stats</p>
                  <button type="button" onClick={() => setStatsOpen(false)}>
                    Close
                  </button>
                </div>
                <dl className="rail-stats">
                  <div>
                    <dt>Global rank</dt>
                    <dd>{stats.personal.rank ? `#${stats.personal.rank.toLocaleString()}` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Your time played</dt>
                    <dd>{formatPlay(stats.personal.seconds)}</dd>
                  </div>
                  <div>
                    <dt>Best run</dt>
                    <dd>{stats.personal.best.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Total coins collected</dt>
                    <dd>{stats.personal.coins.toLocaleString()}</dd>
                  </div>
                </dl>
                <RunnerTimes rows={stats.personal.runners} />
                <h3 className="rail-kicker">Skulls you collected</h3>
                <SkullCountsList counts={stats.personal.skulls} />
                <DiamondCollected count={stats.personal.diamonds} />
              </section>
            </div>
          )}
        </div>
      ) : null}

      {boardOpen ? (
        <div className="rail-sheet">
          <div className="rail-card rail-board">
            <div className="rail-board-head">
              <p className="rail-kicker">Everyone on the rail</p>
              <button type="button" onClick={() => setBoardOpen(false)}>
                Close
              </button>
            </div>
            {board === null ? (
              <p className="rail-sub">Checking the rail…</p>
            ) : (
              <>
                {board.you ? (
                  <div className="rail-claim">
                    <p className="rail-name">
                      {board.you.name}
                      {board.you.rank ? ` · #${board.you.rank}` : ""} · {board.you.score.toLocaleString()}
                      <span className="rail-board-coins">
                        <img src={COIN_ICON} alt="" />
                        {board.you.coins.toLocaleString()} $APECAT COIN
                      </span>
                    </p>
                    <button type="button" className="rail-text-btn" onClick={onLogout}>
                      Log out
                    </button>
                  </div>
                ) : (
                  nameSlot()
                )}
                <ol className="rail-board-list">
                  {board.rows.length ? (
                    board.rows.map((row) => (
                      <li key={row.name} className={row.you ? "is-you" : ""}>
                        <span>#{row.rank}</span>
                        <strong>{row.name}</strong>
                        <em className="rail-board-coins">
                          <img src={COIN_ICON} alt="" />
                          {row.coins.toLocaleString()}
                        </em>
                        <em>{row.score.toLocaleString()}</em>
                        {row.rank != null && row.rank <= 3 && row.ghost ? (
                          <button type="button" className="rail-watch" onClick={() => watchReplay(row.name)}>
                            Watch
                          </button>
                        ) : (
                          <span />
                        )}
                      </li>
                    ))
                  ) : (
                    <li className="rail-board-empty">Nobody’s posted a run yet.</li>
                  )}
                </ol>
              </>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="rail-mute rail-pause"
        aria-label={hud.musicPaused ? "Play music" : "Pause music"}
        onClick={() => apiRef.current?.toggleMusic()}
      >
        {hud.musicPaused ? <Play size={18} /> : <Pause size={18} />}
      </button>
      <button
        type="button"
        className="rail-mute"
        aria-label={hud.muted ? "Unmute" : "Mute"}
        onClick={() => apiRef.current?.toggleMute()}
      >
        {hud.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {hud.phase === "gallery" ? (
        <div className="rail-gallery">
          <p>Drag to look. A and D glance. W and S change the pace.</p>
          <div>
            <button type="button" onClick={() => apiRef.current?.galleryPace(-1)}>
              Slower
            </button>
            <strong>{["Slow", "Stroll", "Walk", "Brisk", "Quick"][hud.pace] ?? "Stroll"}</strong>
            <button type="button" onClick={() => apiRef.current?.galleryPace(1)}>
              Faster
            </button>
            <button type="button" onClick={() => apiRef.current?.toMenu()}>
              Back
            </button>
          </div>
        </div>
      ) : null}

      {hud.phase === "run" && !hud.paused && hud.countdown === 0 ? (
        <button type="button" className="rail-break" onClick={() => apiRef.current?.pause()}>
          Pause
        </button>
      ) : null}

      {hud.phase === "run" && hud.paused ? (
        <div className="rail-freeze">
          <p>Paused</p>
          <button type="button" onClick={() => apiRef.current?.resume()}>
            Resume
          </button>
          <button type="button" className="rail-freeze-menu" onClick={() => apiRef.current?.toMenu()}>
            Menu
          </button>
          <span>Esc resumes. Then 3, 2, 1.</span>
        </div>
      ) : null}

      {hud.phase === "run" && hud.countdown > 0 ? (
        <div className="rail-freeze">
          <strong>{hud.countdown}</strong>
        </div>
      ) : null}

      {hud.phase === "replay" && !hud.replayDone ? <p className="rail-watch-tag">Watching replay</p> : null}

      {hud.phase === "replay" && hud.replayDone ? (
        <div className="rail-freeze">
          <p>Replay over</p>
          <button type="button" onClick={() => apiRef.current?.toMenu()}>
            Menu
          </button>
        </div>
      ) : null}

      {hud.phase === "menu" || hud.phase === "run" || hud.phase === "dead" ? (
        <div className="rail-modes rail-modes-dock">{controlPick()}</div>
      ) : null}

      {hud.phase === "run" && mobile ? (
        <div className="rail-touch">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              apiRef.current?.nudge(-1);
            }}
          >
            Left
          </button>
          <button type="button" onPointerDown={pressAction("jump", true)} onPointerUp={pressAction("jump", false)} onPointerCancel={pressAction("jump", false)}>
            Jump
          </button>
          <button type="button" onPointerDown={pressAction("slide", true)} onPointerUp={pressAction("slide", false)} onPointerCancel={pressAction("slide", false)}>
            Duck
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              apiRef.current?.nudge(1);
            }}
          >
            Right
          </button>
        </div>
      ) : null}
    </div>
  );
}
