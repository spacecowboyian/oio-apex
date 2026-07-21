import { LeaderboardConfig } from "./types";
import { deriveStandings, derivePositionSequence, deriveTransitionSnapshots, scopeToFeatured } from "./runProgress";

/** Nominal row height — used as-is in compact mode. Locked mode stretches rows
 * slightly so the board always reaches exactly the bottom of the frame, no
 * leftover gap from integer row-count rounding. */
export const ROW_HEIGHT = 132;
export const TITLE_HEIGHT = 72;
/** the merged title-bar/column-header row (see `LeaderboardShell`'s
 * `columnHeaders`) — ONE row combining the run-number flash/push with a
 * persistent label for each stat column ("RUN 2"/"TIME"/"TOTAL"/"DIFF",
 * "FINAL"/"FASTEST"/"CONES"/"TOTAL", ...), replacing the plain `TITLE_HEIGHT`
 * bar rather than stacking below it. Only used where a caller explicitly
 * supplies `columnHeaders`. 72px (the header cells' 44px text, matching the
 * hero run-number's own font size) plus 4px of breathing room top and
 * bottom, per Ian's request that the row felt cramped. */
export const HEADER_ROW_HEIGHT = 80;
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
  // scrolling, so show every racer at the SAME nominal ROW_HEIGHT every other
  // render uses (never stretched: row content — font sizes, RankCircle
  // diameter, cell padding — is all fixed-pixel and tuned for 132px rows, so
  // inflating rowHeight to consume extra space just leaves that fixed-size
  // content stranded with dead air around it). The only thing `fillFrame`
  // changes here is the anchor: `locked: true` puts the board at `top: 0`
  // instead of the default bottom-anchor, so it sits flush against whatever
  // is stacked above it (e.g. a landscape video) with any leftover frame
  // space falling below the board, not sandwiched above it.
  if (fillFrame && racerCount <= compactMaxRows) {
    return { locked: true, viewportRows: racerCount, rowHeight: ROW_HEIGHT };
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

/** hold / slide timing for the "everyone moves at once" transition mode
 * (`simultaneousPositionChange` — see LeaderboardShell's
 * `simultaneousTransition`) — every row reshuffles together in one slide,
 * so there's no per-mover staging and the duration doesn't depend on how
 * many racers are featured. Deliberately snappier than the staged
 * `POSITION_TRANSITION_*` timing above (built for one deliberate reveal, not
 * a montage racing through many runs) — a first pass at "keep it moving"
 * pacing, easy to retune independently since it's a separate constant. */
// Retuned 2026-07-20 per Ian: each leg was landing at 14.7s (441 frames),
// which read as too long back to back across a whole run sequence. Rebalanced
// to a flat 10s (300 frames) per leg — HOLD/SETTLE trimmed proportionally
// (kept their original 1:1 split) while LABEL_LEAD/SLIDE stay as-is, since
// those are the fast mechanical beats, not viewing time.
export const SIMULTANEOUS_TRANSITION_HOLD_SECONDS = 3.65;
/** how long the run-label flash/push (the "a new run is starting" beat)
 * plays on its own before the rows themselves cut over and slide — the
 * label announces the change first, then the standings actually move,
 * rather than both firing on the same frame. */
export const SIMULTANEOUS_TRANSITION_LABEL_LEAD_SECONDS = 1;
export const SIMULTANEOUS_TRANSITION_SLIDE_SECONDS = 0.7;
/** how long the board holds on the newly-settled order, after the slide
 * lands, before this leg ends — time to actually read the new standings
 * before the next run starts, per Ian's request. */
export const SIMULTANEOUS_TRANSITION_SETTLE_SECONDS = 3.65;

/** the four constants above, combined — the default "time between runs"
 * (`LeaderboardConfig.runIntervalSeconds`) when a config doesn't override it. */
export const SIMULTANEOUS_TRANSITION_DEFAULT_TOTAL_SECONDS =
  SIMULTANEOUS_TRANSITION_HOLD_SECONDS +
  SIMULTANEOUS_TRANSITION_LABEL_LEAD_SECONDS +
  SIMULTANEOUS_TRANSITION_SLIDE_SECONDS +
  SIMULTANEOUS_TRANSITION_SETTLE_SECONDS;

/**
 * Splits a config's single `runIntervalSeconds` "time between runs" knob
 * back into the four beats `LeaderboardShell` actually animates against —
 * label-lead and slide stay the fixed, fast, mechanical beats they always
 * were; hold and settle both get the FULL requested viewing time, not half
 * each. That's intentional, not a doubling: in a chained run-sequence
 * (`LeaderboardRunSequence`), every leg's settle phase already IS the next
 * leg's opening frame (same pixels, no cut between them, see
 * `buildRunSequenceLegs`) — so a non-first leg's `holdFrames` is 0 and it
 * relies entirely on the PRIOR leg's settle to have already shown its "from"
 * state for the full requested duration. Only the very first leg has no
 * prior leg to borrow that from, so it alone needs its own full-length hold
 * to give run 1 the same on-screen time every later run gets for free.
 * Getting this wrong (splitting hold/settle evenly across every leg
 * regardless of position) was exactly the bug Ian caught 2026-07-20: run 1
 * only got half the requested time before flipping, while every later run
 * got hold+settle stacked back to back — double.
 */
export const simultaneousLegFrames = (
  fps = 30,
  runIntervalSeconds?: number | null,
  isFirstLeg: boolean = true,
) => {
  const totalSeconds = runIntervalSeconds ?? SIMULTANEOUS_TRANSITION_DEFAULT_TOTAL_SECONDS;
  const labelLeadFrames = SIMULTANEOUS_TRANSITION_LABEL_LEAD_SECONDS * fps;
  const slideFrames = SIMULTANEOUS_TRANSITION_SLIDE_SECONDS * fps;
  const viewFrames = Math.round(
    Math.max(0, totalSeconds - SIMULTANEOUS_TRANSITION_LABEL_LEAD_SECONDS - SIMULTANEOUS_TRANSITION_SLIDE_SECONDS) *
      fps,
  );
  const holdFrames = isFirstLeg ? viewFrames : 0;
  const settleFrames = viewFrames;
  return { holdFrames, labelLeadFrames, slideFrames, settleFrames, totalSeconds };
};

export const computeSimultaneousTransitionDuration = (
  fps = 30,
  runIntervalSeconds?: number | null,
  isFirstLeg: boolean = true,
): number => {
  const { holdFrames, labelLeadFrames, slideFrames, settleFrames } = simultaneousLegFrames(
    fps,
    runIntervalSeconds,
    isFirstLeg,
  );
  return Math.ceil(holdFrames + labelLeadFrames + slideFrames + settleFrames + END_BUFFER_FRAMES);
};

/**
 * The last run's leg (`simultaneousPositionChange` mode only) doesn't cut
 * over in place like every earlier run-to-run leg — it books-ends instead:
 * the board holding on the last run's standings pulls itself off screen
 * (the same drawer-close every board already does at a normal render's true
 * end — see `LeaderboardShell`'s `animateOut`/`DRAWER_FRAMES`), then the
 * TRUE final board (fastest/cones/total, once `showPreviousCurrentRuns` is
 * set — see rowCells.tsx) drawer-opens back in, rather than reshuffling the
 * same standings in place. `SIMULTANEOUS_FINAL_EXIT_SECONDS` just needs to
 * cover that 20-frame close spring with a hair of buffer — the audience
 * already had the settle hold from the PRIOR leg to read these standings, so
 * there's no reason to hold again before pulling out.
 */
export const SIMULTANEOUS_FINAL_EXIT_SECONDS = 1;
/** how long the true final board sits on screen, read, before the whole
 * sequence's own end-of-render exit (mirrors `SIMULTANEOUS_TRANSITION_SETTLE_SECONDS`'s
 * role for every earlier leg). */
export const SIMULTANEOUS_FINAL_ENTER_HOLD_SECONDS = 6;

export const computeSimultaneousFinalExitDuration = (fps = 30): number =>
  Math.ceil(SIMULTANEOUS_FINAL_EXIT_SECONDS * fps);

export const computeSimultaneousFinalEnterDuration = (fps = 30): number =>
  Math.ceil(SIMULTANEOUS_FINAL_ENTER_HOLD_SECONDS * fps + END_BUFFER_FRAMES);

/**
 * Total duration a rendered composition needs for this config, at a given
 * fps. Mirrors exactly what `Leaderboard` renders — standings derivation and
 * `finalResultsScope` narrowing — so the scroll plan (and therefore
 * duration) this computes always matches reality.
 */
export const computeDuration = (config: LeaderboardConfig, fps = 30): number => {
  if (config.simultaneousPositionChange) {
    const snapshots = deriveTransitionSnapshots(config);
    if (snapshots) return computeSimultaneousTransitionDuration(fps, config.runIntervalSeconds);
  }
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
