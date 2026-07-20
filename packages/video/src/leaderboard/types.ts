/**
 * The leaderboard data contract. This is the format any future results-import
 * tool (timing software export, spreadsheet, manual entry) should produce —
 * a single JSON object per leaderboard instance. See
 * `video-components/leaderboard-configs/*.json` for worked examples and
 * `video-components/README.md` for the full spec.
 *
 * Vocabulary: a single timed attempt is a "lap" at a track event, a "run" at
 * autocross and rallycross — field names follow that (`runs`, not `laps`,
 * for the run-based events).
 */

export type EventType = "track" | "autocross" | "rallycross";
export type HighlightMode = "leader" | "manual";

export type TrackRacer = {
  pos: number;
  name: string;
  car: string;
  /** gap to the leader, e.g. "+0.412" or "—" for the leader */
  gap: string;
};

/**
 * Autocross and rallycross share this shape — same "run" concept, rallycross
 * adds `total`. `runs` is every run so far, oldest first, **as raw seconds**
 * (e.g. `45.678`, not `"45.678"` or `"0:45.678"`) — whatever a timing system
 * actually outputs. The component derives "last" (the final element),
 * "fastest" (the minimum), and the on-screen `M:SS.mmm` formatting itself;
 * don't provide those separately or pre-format them.
 *
 * No `pos` here on purpose — standings aren't data you supply, they're
 * computed by the component from `runs` (autocross) / `total` (rallycross),
 * every time, including for `throughRun` snapshots. See runProgress.ts.
 */
export type RunRacer = {
  name: string;
  car: string;
  runs: number[];
  /**
   * Cone hits per run, same order/length as `runs` — optional, and only
   * read by `showPreviousCurrentRuns`' final-reveal columns (total cones
   * across every run). Omit entirely for a clean-sheet racer or when cone
   * data isn't tracked; treated as zero. Cone penalties already baked into
   * `runs`' displayed times (standard timing-system behavior) still don't
   * need this field — it's purely for the on-screen cone-count callout, not
   * for computing standings.
   */
  cones?: number[];
};

/** Rallycross ranks by cumulative time across all runs, not a single fastest run — `total` (raw seconds) is that stat. */
export type RallycrossRacer = RunRacer & {
  total: number;
};

export type RacerRecord = TrackRacer | RunRacer | RallycrossRacer;

type BaseConfig = {
  /**
   * Optional context row locked to the top of the board (e.g. "FIT OFF
   * COMPETITORS"). Remotion's `--props` / Studio props panel shallow-merge
   * over defaultProps — a config that wants no title should pass
   * `"title": null` explicitly rather than omitting the key, or a stale
   * title from whatever defaultProps last had can leak through.
   */
  title?: string | null;
  /** "leader" highlights P1 automatically. "manual" highlights exactly the racers named in `featured`. */
  highlightMode: HighlightMode;
  /** racer names to highlight — only used (and required) when highlightMode is "manual" */
  featured?: string[] | null;
  /**
   * Show the leaderboard as it stood after this run number (1-based),
   * instead of the final/complete state — standings are recomputed from
   * that many runs per racer, not read from a separately-provided field.
   * Ignored for `track` (no runs concept). Omit for the final result.
   */
  throughRun?: number | null;
  /**
   * Renders as the minimal final-results table instead of the standard
   * leaderboard: no rank circle, just name/car and one final-result column
   * (fastest run for autocross, total for rallycross, gap for track) — two
   * columns, flush against the left edge (full bleed, no margin), so video
   * footage can run unobstructed to the right of it. Grows bottom-anchored
   * like the standard board, locking edge-to-edge top-to-bottom only if the
   * roster is big enough to need it.
   */
  finalResults?: boolean | null;
  /**
   * Only meaningful when `finalResults` is set. `"all"` (default) shows the
   * whole roster. `"featured"` shows only the class winner plus whichever
   * racers are in `featured` — and brings the rank circle back (it's
   * meaningful again once you're not showing the whole field).
   */
  finalResultsScope?: "all" | "featured" | null;
  /**
   * Pairs with `throughRun` (or the final result, if `throughRun` is
   * omitted) to play a one-time "camera follow" animation: the board holds
   * on standings as of this earlier run, then each `featured` racer moves
   * one at a time (bottom-placed first) to their standing at
   * `throughRun`/final while the camera tracks just them, clamping at the
   * top/bottom of the board once there's nowhere left to scroll. Stat
   * numbers and rank crossfade mid-slide. Ignored for `track` (no runs
   * concept) and when `featured` is empty. See runProgress.ts
   * (`derivePositionSequence`) and LeaderboardShell.tsx.
   */
  previousThroughRun?: number | null;
  /**
   * Whether the board slides back out (like a drawer closing, mirroring the
   * entrance) near the end of the render, instead of just holding on its
   * final frame. Defaults to `true`. Set `false` if the board should stay
   * put through the last frame — e.g. a still export, or a caller doing its
   * own exit transition around the composition.
   */
  animateOut?: boolean | null;
  /**
   * Whether the board slides in from off-screen on mount. Defaults to
   * `true`. Set `false` when a caller is stitching several boards together
   * back to back (see `LeaderboardRunSequence`) and this one isn't the first
   * — the drawer should already be "shown" going into it, not slide in
   * again. Companion to `animateOut` (same drawer, opposite edge).
   */
  enterAnimation?: boolean | null;
  /**
   * Target output frame size — every board is full-bleed to the frame edge,
   * so this decides how much room there is. Defaults to `1920`x`1080`
   * (landscape) to match every existing config. A portrait frame
   * (`frameHeight > frameWidth`) also switches the board's own width from
   * the landscape `WIDTH_FOR_EVENT` constants to full-bleed `frameWidth` —
   * there's no video real estate beside it to preserve, unlike landscape
   * where the board shares the frame with footage. Flat fields, not a
   * nested `{width,height}` object — `--props`/Studio panels shallow-merge
   * over `defaultProps` at the top level only (see README's `title` gotcha),
   * so a nested object risks a half-applied merge.
   */
  frameWidth?: number | null;
  frameHeight?: number | null;
  /**
   * Top-anchors the board (`top: 0`, like natural locked/edge-to-edge mode)
   * even when the roster is small enough to fit compact. Defaults `false` —
   * every existing config keeps the default bottom-anchored, growing-card-
   * from-the-corner behavior. Rows stay at the normal, unstretched
   * `ROW_HEIGHT` either way — this only changes which edge the board is
   * flush against, never row size. Meant for a vertical composition sized to
   * sit directly under a landscape video (e.g. a 1080-wide 16:9 clip above
   * it) — the board should be flush against the frame's top edge (so it
   * touches the bottom of that video with no gap), with any leftover space
   * for a small roster falling below the board instead of above it.
   */
  fillFrame?: boolean | null;
  /**
   * Shows the rank-circle position number. Defaults `true` — every existing
   * config keeps it. Set `false` to drop it entirely (not just hide the
   * digit) — meant for a run-by-run recap where standings are still in
   * motion and a number implies a settled position that isn't real yet; the
   * featured racers' own camera-follow movement already communicates
   * relative standing without one.
   */
  showRank?: boolean | null;
  /**
   * Highlights whoever currently holds P1 overall (green row/endcap — see
   * `rowBgFor`/`endcapBgFor` in rowCells.tsx and LeaderboardShell.tsx).
   * Defaults `true` — every existing config keeps it. Set `false` to turn it
   * off everywhere a row/endcap would otherwise go green; `featured` (yellow)
   * is unaffected. Meant for the same run-by-run context as `showRank` —
   * calling out "currently leading" mid-event reads as more final than it is.
   */
  showLeaderHighlight?: boolean | null;
  /**
   * Only meaningful alongside `previousThroughRun`. Replaces the default
   * "camera follows one featured racer at a time" position-change animation
   * (`derivePositionSequence`/`POSITION_TRANSITION_*` in layout.ts — still
   * the default, unchanged, for every other config) with every row
   * reshuffling together in a single synchronized slide — no per-mover
   * staging, no camera spotlight. Meant for a fast run-by-run recap where
   * staging each featured racer's move one at a time (built for one
   * deliberate reveal) is too slow repeated across many runs; defaults
   * `false`.
   */
  simultaneousPositionChange?: boolean | null;
  /**
   * Replaces the title bar's normal `title` (left) / `runLabel` (right)
   * layout with just the run label, centered, sized like a driver name
   * (see nameCell in rowCells.tsx) instead of the small corner-label-style
   * text — and flashes it at the instant the label changes (same cutover
   * `positionTransition`/`simultaneousTransition` already commit content
   * at), as a bigger, harder-to-miss beat marking "this is a new run," not
   * just a corner detail. Defaults `false`; ignored when there's no
   * `runLabel` to show (i.e. outside a `throughRun`/`previousThroughRun`
   * render).
   */
  heroRunLabel?: boolean | null;
  /**
   * Swaps the standard FAST/LAST stat columns for PREVIOUS RUN / CURRENT
   * RUN — the two runs actually being compared in a `previousThroughRun`
   * transition (the run just before this leg's last one, and this leg's
   * last one), rather than best-ever/most-recent. Blank (not just hidden —
   * the slot stays, empty) for "previous" when there isn't one yet (a
   * racer's very first run). Also changes what the FINAL reveal (once
   * `throughRun` is omitted/final) shows: fastest run, total cone count
   * (see `RunRacer.cones`), and total time, instead of the mid-event
   * columns — since "fastest run ever" and "how many cones total" are the
   * payoff stats once the event's actually over, not run-to-run deltas.
   * Ignored for `track` (no runs concept). Defaults `false`.
   */
  showPreviousCurrentRuns?: boolean | null;
};

/**
 * Discriminated on `eventType` so the `racers` shape is exactly right for
 * each event — track never carries run fields, autocross never carries
 * `total`, etc. Structure your results-import output to match one of these
 * three arms directly.
 */
export type LeaderboardConfig =
  | (BaseConfig & { eventType: "track"; racers: TrackRacer[] })
  | (BaseConfig & { eventType: "autocross"; racers: RunRacer[] })
  | (BaseConfig & { eventType: "rallycross"; racers: RallycrossRacer[] });
