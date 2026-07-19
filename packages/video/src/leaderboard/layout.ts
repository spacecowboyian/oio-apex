import { LeaderboardConfig } from "./types";
import { deriveStandings, derivePositionSequence, scopeToFeatured } from "./runProgress";

/** Nominal row height — used as-is in compact mode. Locked mode stretches rows
 * slightly so the board always reaches exactly the bottom of the frame, no
 * leftover gap from integer row-count rounding. */
export const ROW_HEIGHT = 132;
export const TITLE_HEIGHT = 72;
export const FRAME_HEIGHT = 1080;

export const WIDTH_FOR_EVENT = { track: 900, autocross: 950, rallycross: 1200 } as const;
/** narrow width for the final-results table — just name/car + one time column */
export const FINAL_RESULTS_WIDTH = 620;

export type Layout = {
  /** compact: bottom-anchored, grows with racer count. locked: edge-to-edge, scrolls. */
  locked: boolean;
  /** rows visible at once — equals racers.length when compact (nothing to scroll) */
  viewportRows: number;
  /** actual per-row height to render at — stretched from ROW_HEIGHT in locked mode to fill exactly */
  rowHeight: number;
};

/**
 * The board grows (bottom-anchored, full-bleed to the corner — every board is
 * flush against the frame edge, no margin) as racers are added, until it
 * would run past the frame's height — then it locks edge-to-edge (top:0, no
 * gap at the bottom either) and the rest scrolls underneath instead of the
 * card growing further.
 */
export const computeLayout = (
  racerCount: number,
  hasTitle: boolean,
  margin: number = 0,
  frameHeight: number = FRAME_HEIGHT,
  fillFrame: boolean = false,
): Layout => {
  const titleSpace = hasTitle ? TITLE_HEIGHT : 0;
  const compactAvailable = frameHeight - 2 * margin - titleSpace;
  const compactMaxRows = Math.floor(compactAvailable / ROW_HEIGHT);
  if (!fillFrame && racerCount <= compactMaxRows) {
    return { locked: false, viewportRows: racerCount, rowHeight: ROW_HEIGHT };
  }
  const lockedAvailable = frameHeight - titleSpace;
  // fillFrame with a roster that would otherwise fit compact — nobody needs
  // scrolling, so show every racer (`viewportRows: racerCount`, not however
  // many nominal-height rows the frame happens to fit), just stretched to
  // consume the whole frame instead of a nominal-height card with blank
  // space left over below/above it.
  if (fillFrame && racerCount <= compactMaxRows) {
    return { locked: true, viewportRows: racerCount, rowHeight: lockedAvailable / racerCount };
  }
  const viewportRows = Math.floor(lockedAvailable / ROW_HEIGHT);
  // stretch to consume the exact remaining space — otherwise floor() rounding
  // leaves the card short of the frame's bottom edge by a few dozen px.
  const rowHeight = lockedAvailable / viewportRows;
  return { locked: true, viewportRows, rowHeight };
};

export type ScrollPlan = {
  stops: number[];
  /** whether to hold on stops[0] before moving — false skips straight into
   * the scroll with no pause, when the starting window has nobody worth
   * lingering on (no featured racer down there, or leader mode entirely). */
  holdFirst: boolean;
};

/**
 * Row-index (0-based) window-tops to stop on, in play order.
 * - Manual highlight mode: bottom-most featured racer's window first, up through
 *   any other featured racers, ending at the top. Always holds at every stop —
 *   the first stop is centered on a featured racer by construction.
 * - Leader mode (no featured names) with more racers than fit: nobody at the
 *   bottom is worth stopping for — skip the hold and scroll immediately from
 *   the bottom of the field straight up to the top (P1), holding only there.
 */
export const computeScrollPlan = (
  racers: { name: string }[],
  featuredNames: string[],
  viewportRows: number,
): ScrollPlan => {
  const total = racers.length;
  const maxTop = Math.max(0, total - viewportRows);

  const featuredIdx = racers.reduce<number[]>((acc, r, i) => {
    if (featuredNames.includes(r.name)) acc.push(i);
    return acc;
  }, []);

  if (featuredIdx.length === 0) {
    return maxTop === 0 ? { stops: [0], holdFirst: true } : { stops: [maxTop, 0], holdFirst: false };
  }

  const orderedBottomFirst = [...featuredIdx].sort((a, b) => b - a);
  const centerOffset = Math.floor((viewportRows - 1) / 2);
  const tops = orderedBottomFirst.map((idx) => Math.min(maxTop, Math.max(0, idx - centerOffset)));
  if (tops[tops.length - 1] !== 0) tops.push(0);
  return { stops: tops.filter((t, i, arr) => i === 0 || t !== arr[i - 1]), holdFirst: true };
};

const HOLD_SECONDS = 4;
const TRANSITION_SECONDS = 0.8;
const END_BUFFER_FRAMES = 30;

/** hold / slide timing for each step of the position-change camera-follow
 * animation (`previousThroughRun`) — a slower, more deliberate slide than a normal
 * scroll-stop transition since it's the whole point of the shot, not incidental.
 * One racer moves per step: hold, slide, hold, repeat for the next racer. */
export const POSITION_TRANSITION_HOLD_SECONDS = 3;
export const POSITION_TRANSITION_SLIDE_SECONDS = 1.4;

/** `moverCount` — how many featured racers animate, i.e. `moverNames.length`
 * from `derivePositionSequence`. One hold-then-slide per mover, plus the
 * initial hold. */
export const computePositionTransitionDuration = (moverCount: number, fps = 30): number =>
  Math.ceil(
    (POSITION_TRANSITION_HOLD_SECONDS + moverCount * (POSITION_TRANSITION_SLIDE_SECONDS + POSITION_TRANSITION_HOLD_SECONDS)) *
      fps +
      END_BUFFER_FRAMES,
  );

/**
 * Total duration a rendered composition needs for this config, at a given
 * fps. Mirrors exactly what `Leaderboard` renders — standings derivation and
 * `finalResultsScope` narrowing — so the scroll plan (and therefore
 * duration) this computes always matches reality.
 */
export const computeDuration = (config: LeaderboardConfig, fps = 30): number => {
  const sequence = derivePositionSequence(config);
  if (sequence) {
    return computePositionTransitionDuration(sequence.moverNames.length, fps);
  }
  const ranked = deriveStandings(config);
  const featuredNames = ranked.highlightMode === "manual" ? ranked.featured ?? [] : [];
  const isFinal = Boolean(ranked.finalResults);
  const useScopedRacers = isFinal && ranked.finalResultsScope === "featured";
  // switched explicitly (rather than a generic helper over `ranked.racers`) because
  // that field is a union of three distinct array types across the discriminant —
  // TypeScript can't infer a single generic across it, so narrow per-branch instead.
  let racers: { pos: number; name: string }[];
  switch (ranked.eventType) {
    case "track":
      racers = useScopedRacers ? scopeToFeatured(ranked.racers, featuredNames) : ranked.racers;
      break;
    case "autocross":
      racers = useScopedRacers ? scopeToFeatured(ranked.racers, featuredNames) : ranked.racers;
      break;
    case "rallycross":
      racers = useScopedRacers ? scopeToFeatured(ranked.racers, featuredNames) : ranked.racers;
      break;
  }
  const layout = computeLayout(
    racers.length,
    Boolean(ranked.title),
    0,
    ranked.frameHeight ?? FRAME_HEIGHT,
    ranked.fillFrame ?? false,
  );
  if (!layout.locked) return 90;
  const plan = computeScrollPlan(racers, featuredNames, layout.viewportRows);
  const hold = HOLD_SECONDS * fps;
  const transition = TRANSITION_SECONDS * fps;
  let t = plan.holdFirst ? hold : 0;
  for (let s = 1; s < plan.stops.length; s++) t += transition + hold;
  return Math.ceil(t + END_BUFFER_FRAMES);
};
