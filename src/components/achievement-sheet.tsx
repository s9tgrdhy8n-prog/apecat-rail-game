import { useState } from "react";
import {
  CRYSTAL_NAME,
  GOALS,
  crewDetail,
  goalProgress,
  type AchievementSave,
  type Goal,
  type Tally,
  type UnlockFlags,
} from "@/game/achievements";

function CrystalMark() {
  return <img className="rail-crystal-mark" src="/brand/diamond-skull.png" alt="" />;
}

function crewLine(tally: Tally, unlocked: UnlockFlags) {
  const parts = [
    `APECAT ${tally.rides.APECAT}`,
    `BOGGY ${tally.rides.BOGGY}`,
    `GIMBO ${tally.rides.GIMBO}`,
  ];
  if (unlocked.pinky) parts.push(`PINKY ${tally.rides.PINKY}`);
  if (unlocked.koko) parts.push(`KOKO ${tally.rides.KOKO}`);
  if (unlocked.spooky) parts.push(`SPOOKY ${tally.rides.SPOOKY}`);
  return ` · ${parts.join(" · ")}`;
}

function GoalRow({
  goal,
  tally,
  claimed,
  unlocked,
}: {
  goal: Goal;
  tally: Tally;
  claimed: boolean;
  unlocked: UnlockFlags;
}) {
  const current = goalProgress(goal, tally, unlocked);
  const done = claimed;
  const width = `${Math.round((current / goal.target) * 100)}%`;
  return (
    <li className={done ? "rail-goal is-done" : "rail-goal"}>
      <div className="rail-goal-top">
        <strong>{goal.title}</strong>
        <span>{done ? "Paid" : `${goal.skulls} skull${goal.skulls === 1 ? "" : "s"}`}</span>
      </div>
      <p>{goal.id === "week-crew" ? crewDetail(unlocked) : goal.detail}</p>
      <div className="rail-goal-bar" aria-hidden="true">
        <span style={{ width }} />
      </div>
      <p className="rail-goal-count">
        {current.toLocaleString()} / {goal.target.toLocaleString()}
        {goal.id === "week-crew" ? crewLine(tally, unlocked) : ""}
      </p>
    </li>
  );
}

function SkullBalance({ save }: { save: AchievementSave }) {
  return (
    <div className="rail-crystal">
      <CrystalMark />
      <div>
        <p className="rail-kicker">{CRYSTAL_NAME}</p>
        <strong>{save.skulls.toLocaleString()}</strong>
            <p>Earned by finishing runs, and every 100 Shield, Magnet, and Surge skulls. No cash value.</p>
      </div>
    </div>
  );
}

export function AchievementSheet({
  save,
  onClose,
}: {
  save: AchievementSave;
  onClose: () => void;
}) {
  const [pane, setPane] = useState<"daily" | "weekly" | null>(null);
  const unlocked = { pinky: save.pinky, koko: save.koko, spooky: save.spooky };
  const daily = GOALS.filter((goal) => goal.period === "daily");
  const weekly = GOALS.filter((goal) => goal.period === "weekly");
  return (
    <div className="rail-sheet">
      <div className="rail-stats-windows rail-achieve-windows" data-pane={pane ?? ""}>
        <div className="rail-stats-switch">
          <div className="rail-stats-switch-row">
            <button type="button" className={pane === "daily" ? "is-on" : ""} onClick={() => setPane("daily")}>
              Daily
            </button>
            <button
              type="button"
              className={pane === "weekly" ? "is-personal is-on" : "is-personal"}
              onClick={() => setPane("weekly")}
            >
              Weekly
            </button>
          </div>
          <button type="button" className="rail-stats-switch-close" onClick={onClose}>
            Close
          </button>
        </div>
        <section className="rail-card rail-board rail-stats-window rail-achieve-window rail-achieve-daily">
          <div className="rail-board-head">
            <p className="rail-kicker">Daily</p>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
          <SkullBalance save={save} />
          <p className="rail-sub">Resets at midnight UTC.</p>
          <ul className="rail-goals">
            {daily.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                tally={save.daily}
                claimed={save.claims.includes(`${save.dailyKey}:${goal.id}`)}
                unlocked={unlocked}
              />
            ))}
          </ul>
        </section>
        <section className="rail-card rail-board rail-stats-window rail-stats-personal rail-achieve-window rail-achieve-weekly">
          <div className="rail-board-head">
            <p className="rail-kicker">Weekly</p>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
          <p className="rail-sub">Resets Monday at midnight UTC.</p>
          <ul className="rail-goals">
            {weekly.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                tally={save.weekly}
                claimed={save.claims.includes(`${save.weeklyKey}:${goal.id}`)}
                unlocked={unlocked}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
