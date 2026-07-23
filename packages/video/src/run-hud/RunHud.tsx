import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { color } from "../theme";
import { LeaderboardRow } from "../leaderboard/LeaderboardRow";
import { rankCell, nameCell, endcapBgFor, endcapTextFor } from "../leaderboard/rowCells";
import { StatBlock } from "../leaderboard/RunStats";
import { RowState } from "../leaderboard/LeaderboardShell";
import { WIDTH_FOR_EVENT } from "../leaderboard/layout";
import { ConeIcon } from "../leaderboard/ConeIcon";
import { formatRunTime, lastOf } from "../leaderboard/time";
import { RunHudProps } from "./types";

/** cone sizing/spacing from the design-sketch proof-out (#6): cones packed
 * close together, and close to the HUD row too, per Ian. */
const CONE_SIZE_PX = 144;
const CONE_GAP_PX = 4;
const CONE_TO_ROW_GAP_PX = 8;

/** flush left, offset down 30px from the top — not flush at the very top edge,
 * not the full TITLE_HEIGHT either; per Ian, either of those read wrong once
 * actually measured on screen. */
const TOP_OFFSET_PX = 30;

const DEFAULT_STATE: RowState = { featured: false, leader: true };
const DEFAULT_HOLD_SECONDS = 1;

/**
 * Run HUD (spacecowboyian/oio-apex #6). A persistent on-screen HUD for the run
 * in progress, rendered as an actual `LeaderboardRow` — the racer's own row,
 * in the exact slot they'd occupy on the real board (current position,
 * name/car, last completed run) — bridging "watching the run, counting up the
 * seconds" and "cut to where they now stand". The last cell is a live
 * "THIS RUN" count-up that ticks in real time to the run's final time and then
 * holds; cone hits sit just past the row's right edge (one icon per cone).
 *
 * Built from the real shared `LeaderboardRow`/`StatBlock`/`ConeIcon` and the
 * real leader/featured endcap color rule (`endcapBgFor`/`endcapTextFor`) — not
 * an approximation. The HUD→board reveal choreography (issue #10) and any
 * entrance animation are deliberately out of scope: this is the persistent HUD
 * itself.
 */
export const RunHud: React.FC<RunHudProps> = ({
  racer,
  thisRun,
  cones = 0,
  event = "autocross",
  state = DEFAULT_STATE,
  // `holdSeconds` drives the clip length via the Composition's
  // calculateMetadata (computeRunHudDuration), not anything in the render.
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const width = WIDTH_FOR_EVENT[event];

  // real-time count-up to the run's final time, then hold on it — the final
  // time is baked in (the HUD doesn't live-detect it).
  const liveSeconds = Math.min(frame / fps, thisRun);

  const cells = [
    rankCell(racer, state),
    nameCell(racer, state),
    {
      padding: "18px 30px",
      width: 220,
      content: <StatBlock label="Last" value={formatRunTime(lastOf(racer.runs))} textColor={color.base.white} />,
    },
    {
      padding: "0 34px",
      align: "center" as const,
      width: 240,
      background: endcapBgFor(state),
      content: <StatBlock label="This Run" value={formatRunTime(liveSeconds)} textColor={endcapTextFor(state)} />,
    },
  ];

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: TOP_OFFSET_PX, left: 0, display: "flex", alignItems: "center", gap: CONE_TO_ROW_GAP_PX }}>
        <LeaderboardRow cells={cells} state={state} width={width} />
        {cones > 0 && (
          <div style={{ display: "flex", gap: CONE_GAP_PX }}>
            {Array.from({ length: cones }, (_, i) => (
              <ConeIcon key={i} size={CONE_SIZE_PX} />
            ))}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** the HUD clip runs the length of the run itself (the count-up) plus a short
 * hold on the final time — per issue #10, "as long as the actual run itself". */
export const computeRunHudDuration = (thisRun: number, holdSeconds: number = DEFAULT_HOLD_SECONDS, fps = 30): number =>
  Math.ceil((thisRun + holdSeconds) * fps);
