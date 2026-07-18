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
