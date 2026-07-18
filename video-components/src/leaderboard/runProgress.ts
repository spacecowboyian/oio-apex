import { LeaderboardConfig, RunRacer, RallycrossRacer, TrackRacer } from "./types";
import { fastestOf } from "./time";

export type RankedRunRacer = RunRacer & { pos: number };
export type RankedRallycrossRacer = RallycrossRacer & { pos: number };

/** `LeaderboardConfig` with standings resolved — every racer, whatever the event
 * type, is guaranteed a `pos` here, even though the input contract never supplies
 * one for autocross/rallycross (see types.ts). This is what rendering consumes. */
export type RankedConfig =
  | (Omit<Extract<LeaderboardConfig, { eventType: "track" }>, "racers"> & { racers: TrackRacer[] })
  | (Omit<Extract<LeaderboardConfig, { eventType: "autocross" }>, "racers"> & { racers: RankedRunRacer[] })
  | (Omit<Extract<LeaderboardConfig, { eventType: "rallycross" }>, "racers"> & { racers: RankedRallycrossRacer[] });

/**
 * Standings are never data you supply — they're computed here, always, from
 * `runs` (autocross: ranked by fastest run) or `total` (rallycross: ranked by
 * cumulative time), every render. `throughRun` (1-based) additionally slices
 * every racer's `runs` down to that many entries first and recomputes both
 * the ranking stat and standings from that slice — simulating the
 * leaderboard as it stood right after that run — instead of the final
 * state. Assumes every racer has completed the same number of runs at each
 * checkpoint (true for a standard heat/round structure).
 *
 * Track supplies `pos` directly (no runs/total concept to derive it from)
 * and passes through unchanged.
 */
/** `deriveStandings`'s logic, parametrized by an explicit run count instead of
 * always reading `config.throughRun` — the building block both `deriveStandings`
 * and `derivePositionTransition` (two different run-count snapshots) share. */
const standingsForRunCount = (config: LeaderboardConfig, n: number | undefined): RankedConfig => {
  if (config.eventType === "track") return config;

  if (config.eventType === "autocross") {
    const withRuns = config.racers.map((r) => ({ ...r, runs: n ? r.runs.slice(0, n) : r.runs }));
    const sorted = [...withRuns].sort((a, b) => fastestOf(a.runs) - fastestOf(b.runs));
    return { ...config, racers: sorted.map((r, i) => ({ ...r, pos: i + 1 })) };
  }

  // rallycross — when slicing to a through-run snapshot, total-so-far is the sum of
  // runs completed; otherwise `total` is the authoritative cumulative time as supplied.
  const withTotals = config.racers.map((r) => {
    const runs = n ? r.runs.slice(0, n) : r.runs;
    const total = n ? runs.reduce((sum, x) => sum + x, 0) : r.total;
    return { ...r, runs, total };
  });
  const sorted = [...withTotals].sort((a, b) => a.total - b.total);
  return { ...config, racers: sorted.map((r, i) => ({ ...r, pos: i + 1 })) };
};

export const deriveStandings = (config: LeaderboardConfig): RankedConfig =>
  standingsForRunCount(config, config.eventType === "track" ? undefined : config.throughRun ?? undefined);

/** Like `standingsForRunCount`, but each racer's run count is picked individually —
 * the building block for a position-change sequence where only one racer at a time
 * has "moved on" to their later time while everyone else is still at the earlier one. */
const standingsMixed = (config: LeaderboardConfig, runCountFor: (name: string) => number | undefined): RankedConfig => {
  if (config.eventType === "track") return config;

  if (config.eventType === "autocross") {
    const withRuns = config.racers.map((r) => {
      const n = runCountFor(r.name);
      return { ...r, runs: n ? r.runs.slice(0, n) : r.runs };
    });
    const sorted = [...withRuns].sort((a, b) => fastestOf(a.runs) - fastestOf(b.runs));
    return { ...config, racers: sorted.map((r, i) => ({ ...r, pos: i + 1 })) };
  }

  const withTotals = config.racers.map((r) => {
    const n = runCountFor(r.name);
    const runs = n ? r.runs.slice(0, n) : r.runs;
    const total = n ? runs.reduce((sum, x) => sum + x, 0) : r.total;
    return { ...r, runs, total };
  });
  const sorted = [...withTotals].sort((a, b) => a.total - b.total);
  return { ...config, racers: sorted.map((r, i) => ({ ...r, pos: i + 1 })) };
};

/**
 * A chain of standings snapshots for the "camera follow" position-change
 * animation (see types.ts's `previousThroughRun`, LeaderboardShell.tsx) —
 * `steps[0]` has every racer at `previousThroughRun`; each subsequent step
 * advances exactly one more `featured` racer to their `throughRun`/final
 * time (bottom-placed-first, so the animation always moves someone up, never
 * down), ending with `steps[N]` at the full `throughRun`/final result for
 * everyone. `moverNames[k]` names who changes between `steps[k]` and
 * `steps[k+1]`. This lets the shell animate featured racers one at a time —
 * showing each one's move clearly instead of the whole field reshuffling (and
 * potentially each other) at once. `null` when there's nothing to animate
 * (track, no `previousThroughRun`, or no `featured` names).
 */
export const derivePositionSequence = (
  config: LeaderboardConfig,
): { steps: RankedConfig[]; moverNames: string[] } | null => {
  if (config.eventType === "track") return null;
  if (config.previousThroughRun == null) return null;
  const featuredNames = config.highlightMode === "manual" ? config.featured ?? [] : [];
  if (featuredNames.length === 0) return null;

  const fromN = config.previousThroughRun;
  const toN = config.throughRun ?? undefined;

  const fromStandings = standingsForRunCount(config, fromN);
  if (fromStandings.eventType === "track") return null;
  const fromIndexOf = new Map(fromStandings.racers.map((r, i) => [r.name, i]));
  // bottom-placed first — every step moves someone up, never down, and the
  // racer already lowest in the field goes first (same "build suspense
  // toward the top" convention the rest of the board uses).
  const movers = [...featuredNames]
    .filter((name) => fromIndexOf.has(name))
    .sort((a, b) => (fromIndexOf.get(b) ?? 0) - (fromIndexOf.get(a) ?? 0));

  // Bystanders (every racer not in `movers`) are NOT part of the animation —
  // they should always reflect a single coherent, correct snapshot, not be
  // stuck at `fromN` forever. If they stayed at `fromN` through the final
  // step, that step would compare movers' full `toN` totals against
  // bystanders' partial `fromN` totals — for a cumulative stat (rallycross's
  // `total`), a partial total is always smaller than a fuller one purely
  // because it covers fewer runs, which was producing wildly wrong ranks
  // (a mover ending up dead last against bystanders who'd barely completed
  // any runs). So: everyone starts at `fromN` for the initial hold (a fully
  // coherent "as of the earlier run" snapshot), then bystanders jump straight
  // to `toN` from the first slide onward (a fully coherent "as of now"
  // backdrop) while each mover, in turn, still transitions `fromN` → `toN`.
  const moverSet = new Set(movers);
  const movedSoFar = new Set<string>();
  const steps: RankedConfig[] = [standingsMixed(config, () => fromN)];
  for (const mover of movers) {
    movedSoFar.add(mover);
    steps.push(
      standingsMixed(config, (name) => (moverSet.has(name) ? (movedSoFar.has(name) ? toN : fromN) : toN)),
    );
  }
  return { steps, moverNames: movers };
};

/** winner + featured only, preserving order — finalResultsScope: "featured". */
export const scopeToFeatured = <T extends { pos: number; name: string }>(
  racers: T[],
  featuredNames: string[],
): T[] => racers.filter((r) => r.pos === 1 || featuredNames.includes(r.name));
