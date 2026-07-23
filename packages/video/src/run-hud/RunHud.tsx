import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color } from "../theme";
import { LeaderboardRow } from "../leaderboard/LeaderboardRow";
import { StatBlock, LABEL_SIZE, MUTED_ENDCAP_BG, MUTED_ENDCAP_TEXT } from "../leaderboard/RunStats";
import { RowState } from "../leaderboard/LeaderboardShell";
import { WIDTH_FOR_EVENT } from "../leaderboard/layout";
import { ConeIcon, CONE_ASPECT } from "../leaderboard/ConeIcon";
import { formatRunTime, lastOf } from "../leaderboard/time";
import { RunHudProps } from "./types";

/** 30% down from the board's 144px — per Ian, the board-scale cones read far
 * too heavy floating next to a single HUD row. */
const CONE_SIZE_PX = 101;
const CONE_WIDTH_PX = CONE_SIZE_PX * CONE_ASPECT;
const CONE_GAP_PX = 4;
const CONE_TO_ROW_GAP_PX = 8;

/** cones slide out one after another rather than as a block. */
const CONE_STAGGER_FRAMES = 4;
const CONE_SLIDE_FRAMES = 14;

/** flush left, offset down 30px from the top — not flush at the very top edge,
 * not the full TITLE_HEIGHT either; per Ian, either of those read wrong once
 * actually measured on screen. */
const TOP_OFFSET_PX = 30;

/** matches the driver-name size the board's own `nameCell` uses. */
const NAME_SIZE_PX = 44;

const DEFAULT_HOLD_SECONDS = 1;

/**
 * The HUD renders in the leaderboard's NEUTRAL grayscale, always — never the
 * leader green or the featured yellow.
 *
 * Per Ian: a green HUD reads as a status signal ("this run is winning"), which
 * is wrong — the HUD is just the run in progress, and the driver's standing is
 * the board's job to tell you. He wants the grayscale treatment even when the
 * driver IS in first. `state` is still accepted on the props for callers that
 * want it recorded, but it deliberately does not drive HUD color.
 */
const HUD_STATE: RowState = { featured: false, leader: false };

/**
 * The driver-name cell. Two deliberate differences from the board's `nameCell`:
 *
 *  - No car subtitle. Per Ian, on a single floating HUD row it's noise.
 *  - An INVISIBLE label line above the name, carrying the exact styles
 *    `StatBlock` gives its own label. `StatBlock` is a two-line block
 *    (label over value); a bare one-line name would center itself against
 *    that combined height and sit visibly above the LAST / THIS RUN figures.
 *    Reserving the label's line puts the name on the same line as the times,
 *    which is what Ian asked for — and borrowing StatBlock's real styles
 *    means it stays aligned if that type scale ever changes.
 */
const hudNameCell = (name: string) => ({
  padding: "18px 26px",
  content: (
    <div>
      <div
        aria-hidden
        style={{
          fontSize: LABEL_SIZE,
          fontWeight: 700,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          visibility: "hidden" as const,
        }}
      >
        &nbsp;
      </div>
      <div style={{ fontSize: NAME_SIZE_PX, fontWeight: 700, color: color.base.white, whiteSpace: "nowrap" as const }}>
        {name}
      </div>
    </div>
  ),
});

/**
 * Run HUD (spacecowboyian/oio-apex #6). A persistent on-screen HUD for the run
 * in progress, rendered as an actual `LeaderboardRow` — the racer's own row
 * (name, last completed run) — bridging "watching the run, counting up the
 * seconds" and "cut to where they now stand". The last cell is a live
 * "THIS RUN" count-up that ticks in real time to the run's final time and then
 * holds; cone hits slide out from under the row's right edge, one per cone.
 *
 * No position/rank marker: per Ian the HUD is about the run, not the standing,
 * so the rank circle is dropped and the row starts at the driver's name.
 *
 * Built from the real shared `LeaderboardRow`/`StatBlock`/`ConeIcon` — not an
 * approximation. The HUD→board reveal choreography (issue #10) is still out of
 * scope; the cone entrance below is the HUD's own.
 */
export const RunHud: React.FC<RunHudProps> = ({
  racer,
  thisRun,
  cones = 0,
  event = "autocross",
  // `state` is intentionally unused for color — see HUD_STATE.
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
    hudNameCell(racer.name),
    {
      padding: "18px 30px",
      width: 220,
      content: <StatBlock label="Last" value={formatRunTime(lastOf(racer.runs))} textColor={color.base.white} />,
    },
    {
      padding: "0 34px",
      // RIGHT, not center: the count-up grows a digit as it crosses 10s
      // (6.267 -> 52.281). Centered, that widening shoves the number sideways
      // mid-run. Pinned right, it grows leftward off a fixed right edge and
      // the figure never jumps.
      align: "right" as const,
      width: 240,
      background: MUTED_ENDCAP_BG,
      content: <StatBlock label="This Run" value={formatRunTime(liveSeconds)} textColor={MUTED_ENDCAP_TEXT} />,
    },
  ];

  // Total resting width of the cone strip, used as the clip window.
  const coneStripWidth = cones > 0 ? cones * CONE_WIDTH_PX + (cones - 1) * CONE_GAP_PX : 0;

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: TOP_OFFSET_PX, left: 0, display: "flex", alignItems: "center" }}>
        <LeaderboardRow cells={cells} state={HUD_STATE} width={width} />
        {cones > 0 && (
          // The cones appear to slide out from UNDER the row. They can't simply
          // be stacked behind it — the row's own background is only ~12% alpha,
          // so anything behind it shows straight through. Instead this strip is
          // an overflow-hidden window butted against the row's right edge: a
          // cone translated left of it is genuinely clipped, then emerges.
          <div
            style={{
              marginLeft: CONE_TO_ROW_GAP_PX,
              width: coneStripWidth,
              height: CONE_SIZE_PX,
              overflow: "hidden",
              display: "flex",
              gap: CONE_GAP_PX,
              flexShrink: 0,
            }}
          >
            {Array.from({ length: cones }, (_, i) => {
              const progress = spring({
                fps,
                frame: frame - i * CONE_STAGGER_FRAMES,
                config: { damping: 200 },
                durationInFrames: CONE_SLIDE_FRAMES,
              });
              // far enough left to clear its own resting offset plus its width,
              // so it starts fully outside the clip window.
              const hiddenX = -((i + 1) * (CONE_WIDTH_PX + CONE_GAP_PX));
              return (
                <div
                  key={i}
                  style={{ flexShrink: 0, transform: `translateX(${interpolate(progress, [0, 1], [hiddenX, 0])}px)` }}
                >
                  <ConeIcon size={CONE_SIZE_PX} />
                </div>
              );
            })}
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
