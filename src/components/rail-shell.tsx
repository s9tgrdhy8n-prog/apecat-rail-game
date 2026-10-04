import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Coins, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { SignInGate, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { EMPTY_HUD, type Hud, type Nudge, type RailApi, type RunnerName } from "@/game/types";
import { claimName, getBoard, submitRun, type BoardState } from "@/game/board";

const RUNNERS: RunnerName[] = ["APECAT", "BOGGO", "GIMBO"];
const MOBILE_KEY = "apecat-rail-mobile";

export function RailShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<RailApi | null>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const { user, isPending } = useCurrentUserState();
  const [board, setBoard] = useState<BoardState | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [mobile, setMobile] = useState(false);
  const posted = useRef(new Set<number>());

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

  useEffect(() => {
    if (isPending || !user) return;
    let cancel = false;
    void getBoard()
      .then((next) => {
        if (!cancel) setBoard(next);
      })
      .catch(() => {
        if (!cancel) setBoard({ name: null, rows: [], you: null });
      });
    return () => {
      cancel = true;
    };
  }, [isPending, user?.id]);

  useEffect(() => {
    if (hud.phase === "run") setBoardOpen(false);
  }, [hud.phase]);

  useEffect(() => {
    if (!board?.name || hud.phase !== "dead" || hud.runSerial === 0) return;
    if (posted.current.has(hud.runSerial)) return;
    posted.current.add(hud.runSerial);
    void submitRun({
      data: { score: hud.score, meters: hud.meters, coins: hud.coins, runner: hud.runner },
    })
      .then((res) => {
        if (res.ok) setBoard(res.board);
      })
      .catch(() => {
        posted.current.delete(hud.runSerial);
      });
  }, [board?.name, hud.phase, hud.runSerial, hud.score, hud.meters, hud.coins, hud.runner]);

  async function onClaim(e: React.FormEvent) {
    e.preventDefault();
    setClaiming(true);
    setNameError("");
    try {
      const result = await claimName({ data: nameDraft });
      if (!result.ok) {
        setNameError(result.error);
        return;
      }
      const next = await getBoard();
      setBoard(next);
      setNameDraft("");
      if (hud.phase === "dead" && hud.runSerial > 0 && !posted.current.has(hud.runSerial)) {
        posted.current.add(hud.runSerial);
        const postedRun = await submitRun({
          data: { score: hud.score, meters: hud.meters, coins: hud.coins, runner: hud.runner },
        });
        if (postedRun.ok) setBoard(postedRun.board);
      }
    } catch {
      setNameError("Couldn’t reach the rail. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, input, textarea, a, .rail-sheet")) return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = swipe.current;
    if (!start || start.id !== e.pointerId) return;
    swipe.current = null;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < 36) return;
    const dir: Nudge = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : dy > 0 ? "slide" : "jump";
    apiRef.current?.nudge(dir);
  }

  useEffect(() => {
    try {
      setMobile(localStorage.getItem(MOBILE_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);

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
  function picks() {
    return (
      <div className="rail-picks">
        {RUNNERS.map((name) => (
          <button
            key={name}
            type="button"
            className={name === hud.runner ? "is-on" : ""}
            onClick={() => apiRef.current?.pick(name)}
          >
            {name}
          </button>
        ))}
      </div>
    );
  }

  function nameSlot() {
    if (isPending) return <p className="rail-sub">Checking the rail…</p>;
    return (
      <SignInGate
        fallback={
          <Link to="/login" className="rail-start">
            Sign in to claim a name
          </Link>
        }
      >
        {board === null ? (
          <p className="rail-sub">Checking the rail…</p>
        ) : board.name ? (
          <p className="rail-name">
            Riding as <strong>{board.name}</strong>
          </p>
        ) : (
          <form className="rail-claim" onSubmit={onClaim}>
            <label>
              <span className="rail-sub">Claim a name. Nobody else can use it.</span>
              <input
                value={nameDraft}
                maxLength={16}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="YOUR NAME"
                onChange={(e) => setNameDraft(e.target.value)}
              />
            </label>
            <button type="submit" disabled={claiming}>
              {claiming ? "Claiming…" : "Claim"}
            </button>
            {nameError ? <p className="rail-name-error">{nameError}</p> : null}
          </form>
        )}
      </SignInGate>
    );
  }

  const showHud = hud.phase === "run" || hud.phase === "dead";

  return (
    <div
      className="rail-root"
      data-phase={hud.phase}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipe.current = null;
      }}
    >
      <canvas ref={canvasRef} className="rail-canvas" />
      <div className="rail-vignette" />

      {showHud ? (
        <div className="rail-hud">
          <div className="rail-stat">
            <span className="rail-kicker">
              <Coins size={14} aria-hidden="true" /> APE
            </span>
            <strong>{hud.coins}</strong>
          </div>
          <div className="rail-stat rail-stat-mid">
            <strong>{hud.meters}m</strong>
            <span>{hud.score.toLocaleString()} pts</span>
            {hud.buff ? <span className="rail-buff">{hud.buff}</span> : null}
          </div>
          <div className="rail-stat rail-stat-end">
            <span>Best</span>
            <strong>{hud.best.toLocaleString()}</strong>
          </div>
        </div>
      ) : null}

      {showHud ? <div className="rail-picks rail-picks-bar">{picks()}</div> : null}

      {hud.flash ? <div className="rail-flash">{hud.flash}</div> : null}

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
            <p className="rail-lede rail-lede-hot">
              {hud.runner === "BOGGO"
                ? "Boggo takes the tunnel. "
                : hud.runner === "GIMBO"
                  ? "Gimbo takes the tunnel. "
                  : "Ape the Cat takes the tunnel. "}
              Get the highest score. Don’t kiss the bears.
            </p>
            <button
              type="button"
              className="rail-start"
              onClick={() => {
                apiRef.current?.kickMusic();
                apiRef.current?.start();
              }}
            >
              Start
            </button>
            {nameSlot()}
            <button type="button" className="rail-board-btn" onClick={() => setBoardOpen(true)}>
              Leaderboard
            </button>
            {picks()}
            {controlPick()}
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
              <li>orbs · sliding bears</li>
            </ul>
            )}
            {hud.best > 0 ? <p className="rail-sub">Best {hud.best.toLocaleString()}</p> : null}
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
            <h2 className="rail-title">{hud.newBest ? "CLEAN" : "WRECKED"}</h2>
            <div className="rail-scoreline">
              <p>
                <span className="rail-sub">Score</span>
                <strong>{hud.score.toLocaleString()}</strong>
              </p>
              <p>
                <span className="rail-sub">Coins</span>
                <strong>{hud.coins}</strong>
              </p>
              <p>
                <span className="rail-sub">Run</span>
                <strong>{hud.meters}m</strong>
              </p>
            </div>
            <button
              type="button"
              className="rail-again"
              onClick={() => {
                apiRef.current?.kickMusic();
                apiRef.current?.start();
              }}
            >
              Run it back
            </button>
            {hud.best > 0 ? <p className="rail-sub">Best {hud.best.toLocaleString()}</p> : null}
            {board?.you ? (
              <p className="rail-sub">
                Rail rank {board.you.rank} · best {board.you.score.toLocaleString()}
              </p>
            ) : (
              nameSlot()
            )}
            <button type="button" className="rail-board-btn" onClick={() => setBoardOpen(true)}>
              Leaderboard
            </button>
          </div>
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
            <UserButton />
            {!user && !isPending ? (
              <Link to="/login" className="rail-start">
                Sign in to save your score
              </Link>
            ) : isPending || (user && board === null) ? (
              <p className="rail-sub">Checking the rail…</p>
            ) : (
              <>
                {board?.you ? (
                  <p className="rail-name">
                    {board.you.name} · #{board.you.rank} · {board.you.score.toLocaleString()}
                  </p>
                ) : (
                  nameSlot()
                )}
                <ol className="rail-board-list">
                  {board?.rows.length ? (
                    board.rows.map((row) => (
                      <li key={row.name} className={row.you ? "is-you" : ""}>
                        <span>#{row.rank}</span>
                        <strong>{row.name}</strong>
                        <em>{row.score.toLocaleString()}</em>
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
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              apiRef.current?.nudge("jump");
            }}
          >
            Jump
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              apiRef.current?.nudge("slide");
            }}
          >
            Slide
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
