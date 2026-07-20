import { LeaderboardConfig, RunRacer, RallycrossRacer, TrackRacer } from "./types";
import { fastestOf } from "./time";

export type RankedRunRacer = RunRacer & { pos: number };
/** `gapToLeader` — this racer's `total` minus whoever's currently in P1's
 * `total`, for the same snapshot (0 for the leader themselves) — the
 * building block for a "how far behind" column. Computed alongside `pos`,
 * never supplied. */
export type RankedRallycrossRacer = RallycrossRacer & { pos: number; gapToLeader: number };

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
/** `deriveStandings`'s logic, parametrized by a PER-RACER run count instead of
 * one uniform number — the building block both `deriveStandings` (same count for
 * everyone) and `derivePositionSequence`'s `posSteps` (a different count per
 * racer, to build a single coherent intermediate ordering — see below) share. */
const standingsWithRunCounts = (config: LeaderboardConfig, nFor: (name: string) => number | undefined): RankedConfig => {
  if (config.eventType === "track") return config;

  if (config.eventType === "autocross") {
    const withRuns = config.racers.map((r) => {
      const n = nFor(r.name);
      return { ...r, runs: n ? r.runs.slice(0, n) : r.runs };
    });
    const sorted = [...withRuns].sort((a, b) => fastestOf(a.runs) - fastestOf(b.runs));
    return { ...config, racers: sorted.map((r, i) => ({ ...r, pos: i + 1 })) };
  }

  // rallycross — when slicing to a through-run snapshot, total-so-far is the sum of
  // runs completed; otherwise `total` is the authoritative cumulative time as supplied.
  const withTotals = config.racers.map((r) => {
    const n = nFor(r.name);
    const runs = n ? r.runs.slice(0, n) : r.runs;
    const total = n ? runs.reduce((sum, x) => sum + x, 0) : r.total;
    return { ...r, runs, total };
  });
  const sorted = [...withTotals].sort((a, b) => a.total - b.total);
  const leaderTotal = sorted[0]?.total ?? 0;
  return { ...config, racers: sorted.map((r, i) => ({ ...r, pos: i + 1, gapToLeader: r.total - leaderTotal })) };
};

const standingsForRunCount = (config: LeaderboardConfig, n: number | undefined): RankedConfig =>
  standingsWithRunCounts(config, () => n);

export const deriveStandings = (config: LeaderboardConfig): RankedConfig =>
  standingsForRunCount(config, config.eventType === "track" ? undefined : config.throughRun ?? undefined);

/**
 * Two independently-coherent standings snapshots for the "camera follow"
 * position-change animation (see types.ts's `previousThroughRun`,
 * LeaderboardShell.tsx) — `from` is every racer ranked at `previousThroughRun`,
 * `to` is every racer ranked at `throughRun`/final. `moverNames` lists which
 * `featured` racers get an animated turn, bottom-placed-first (by `from`
 * position) — every featured racer gets one, even if their rank doesn't
 * change between the two snapshots (their stat numbers can still differ, and
 * the shell gives them a "flash in place" instead of a slide).
 *
 * `from`/`to` are what every row's DISPLAYED content (numbers, rank digit) is
 * ever drawn from — never anything mixed, and never re-derived mid-sequence.
 * The shell commits EVERY row's content to `to` in one instant, before any
 * shuffling starts (see LeaderboardShell's `contentRevealed` cutover). At that
 * SAME instant, every non-featured ("bystander") row also settles into its
 * true `to`-relative order — bystanders don't get an individual animated
 * turn, they just reflect the updated results the moment they're revealed.
 * Only featured racers then get an individually staged slide, one at a time,
 * through that now-fixed bystander backdrop.
 *
 * This shape survived two broken attempts, both caught by extracting frames
 * from an actual render rather than trusting the animation logic in the
 * abstract: (1) mixing run counts within one sort to pick a row's on-screen
 * slot compared a still-pending racer's PARTIAL stat directly against
 * bystanders' FULL stat — a partial cumulative total is always smaller purely
 * for covering fewer runs, so pending racers sorted artificially high; (2)
 * projecting that partial stat onto a comparable basis before sorting fixed
 * rallycross but not autocross (discounting a "fastest single run" figure by
 * run-count ratio has no principled basis, and sorted pending racers to the
 * literal top regardless of real position); (3) a first pass at THIS
 * approach assumed bystanders never change rank relative to EACH OTHER
 * between `from` and `to` — false for real data (two non-featured racers
 * swapping rank between runs is normal), which broke the "reinsert each mover
 * into `from`'s order" reconstruction in most of a real dataset's run
 * transitions (verified structurally: `orderSteps[N]` failed to equal `to`'s
 * true order in the majority of transitions checked).
 *
 * `orderSteps[k]` fixes that by treating the bystander sub-order as CONSTANT
 * (always `to`'s relative order — see `bystanders` below) across every step,
 * and placing each mover into a gap in that backdrop using a "how many
 * bystanders rank better than me" COUNT — never a raw stat, and never a
 * cross-snapshot comparison: a still-pending mover's gap is counted within
 * the single coherent `from` snapshot, an already-turned mover's within `to`.
 * `orderSteps[N]` (every mover turned, every count computed via `to`)
 * reconstructs `to`'s exact order by definition. `orderSteps[0]` (every mover
 * still pending, every count computed via `from`) is what the board reveals
 * to the moment content commits — NOT `from`'s own raw order, since
 * bystanders have already reflowed; the true pre-commit hold uses `from`'s
 * raw order directly (computed by the shell from `from` itself, not from
 * this array — see LeaderboardShell's `holdOrder`).
 */
/**
 * Just the two standings snapshots for a `previousThroughRun` -> `throughRun`
 * transition — the same `from`/`to` `derivePositionSequence` computes, without
 * its staged-turn machinery (`moverNames`/`orderSteps`), which exists to
 * sequence ONE mover at a time into a fixed bystander backdrop. The
 * "everyone moves at once" transition mode (see LeaderboardShell's
 * `simultaneousTransition`) doesn't stage anything — every row interpolates
 * directly from its `from`-index to its `to`-index in one synchronized
 * slide — so it has no use for that machinery and this is all it needs.
 */
export const deriveTransitionSnapshots = (
  config: LeaderboardConfig,
): { from: RankedConfig; to: RankedConfig } | null => {
  if (config.eventType === "track") return null;
  if (config.previousThroughRun == null) return null;
  const fromN = config.previousThroughRun;
  const toN = config.throughRun ?? undefined;
  const from = standingsForRunCount(config, fromN);
  const to = standingsForRunCount(config, toN);
  if (from.eventType === "track" || to.eventType === "track") return null;
  return { from, to };
};

export const derivePositionSequence = (
  config: LeaderboardConfig,
): { from: RankedConfig; to: RankedConfig; moverNames: string[]; orderSteps: string[][] } | null => {
  if (config.eventType === "track") return null;
  if (config.previousThroughRun == null) return null;
  const featuredNames = config.highlightMode === "manual" ? config.featured ?? [] : [];
  if (featuredNames.length === 0) return null;

  const fromN = config.previousThroughRun;
  const toN = config.throughRun ?? undefined;
  const from = standingsForRunCount(config, fromN);
  const to = standingsForRunCount(config, toN);
  if (from.eventType === "track" || to.eventType === "track") return null;

  const fromIndexOf = new Map(from.racers.map((r, i) => [r.name, i]));
  const toIndexOf = new Map(to.racers.map((r, i) => [r.name, i]));
  // bottom-placed first — the racer already lowest in the field goes first
  // (same "build suspense toward the top" convention the rest of the board
  // uses). Every featured racer present in both snapshots gets a turn, even
  // ones whose rank doesn't change — see the shell for the "flash" treatment.
  const moverNames = [...featuredNames]
    .filter((name) => fromIndexOf.has(name) && toIndexOf.has(name))
    .sort((a, b) => (fromIndexOf.get(b) ?? 0) - (fromIndexOf.get(a) ?? 0));
  if (moverNames.length === 0) return null;

  const moverSet = new Set(moverNames);
  const bystanders = to.racers.map((r) => r.name).filter((n) => !moverSet.has(n));

  // how many bystanders rank better than `name`, evaluated entirely within
  // ONE coherent snapshot (`to` if this mover has already had its turn,
  // `from` if not) — never a cross-snapshot or partial-vs-full comparison.
  const bystanderGapFor = (name: string, useTo: boolean): number => {
    const indexOf = useTo ? toIndexOf : fromIndexOf;
    const idx = indexOf.get(name) ?? 0;
    return bystanders.filter((b) => (indexOf.get(b) ?? Infinity) < idx).length;
  };

  const buildStep = (turnedCount: number): string[] => {
    const turned = new Set(moverNames.slice(0, turnedCount));
    // two movers with nothing between them (no bystander separates them) land
    // in the same gap — with 2+ featured racers this is common, not an edge
    // case. Resolving that tie by `moverNames`' fixed bottom-first TURN order
    // (the original approach) is wrong whenever it doesn't match their actual
    // relative rank: e.g. two already-turned movers adjacent in `to` need to
    // sort by their real `to` rank, not by which one happened to move first.
    // Sort tied movers by their own index in whichever basis THEY'RE each
    // using (`to` if turned, `from` if still pending) — valid since that's a
    // same-basis, apples-to-apples comparison. A tie straddling two different
    // bases (one turned, one still pending) has no single valid ordering
    // between them, so it falls back to turn order (stable sort preserves
    // `moverNames`' original relative order for that pair specifically).
    const moverInfo = moverNames.map((name) => {
      const useTo = turned.has(name);
      return { name, useTo, gap: bystanderGapFor(name, useTo), basisIndex: (useTo ? toIndexOf : fromIndexOf).get(name) ?? 0 };
    });
    const result: string[] = [];
    for (let gap = 0; gap <= bystanders.length; gap++) {
      const tied = moverInfo
        .filter((m) => m.gap === gap)
        .sort((a, b) => (a.useTo === b.useTo ? a.basisIndex - b.basisIndex : 0));
      result.push(...tied.map((m) => m.name));
      if (gap < bystanders.length) result.push(bystanders[gap]);
    }
    return result;
  };

  const orderSteps: string[][] = [];
  for (let turnedCount = 0; turnedCount <= moverNames.length; turnedCount++) {
    orderSteps.push(buildStep(turnedCount));
  }

  return { from, to, moverNames, orderSteps };
};

/** winner + featured only, preserving order — finalResultsScope: "featured". */
export const scopeToFeatured = <T extends { pos: number; name: string }>(
  racers: T[],
  featuredNames: string[],
): T[] => racers.filter((r) => r.pos === 1 || featuredNames.includes(r.name));
