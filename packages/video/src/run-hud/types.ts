import { RowState } from "../leaderboard/LeaderboardShell";

/** the competitor whose run this HUD is following. Same shape a leaderboard
 * row consumes (`pos`, `name`, `car`, chronological `runs`) plus nothing
 * extra — the HUD IS a real leaderboard row. */
export type RunHudRacer = {
  pos: number;
  name: string;
  car: string;
  /** completed runs so far, oldest first — the "Last" cell reads the most
   * recent. The run currently in progress is `thisRun`, not part of this. */
  runs: number[];
};

/**
 * Data contract for the run HUD (spacecowboyian/oio-apex #6). A persistent
 * on-screen HUD, rendered as an actual `LeaderboardRow` (the racer's own row,
 * in the slot they'd occupy on the real board) with a live "THIS RUN"
 * count-up, plus cone-hit icons past the row's right edge.
 */
export type RunHudProps = {
  racer: RunHudRacer;
  /** the final time of the run currently in progress, in seconds. The THIS RUN
   * cell counts up to this in real time and then holds — the run's final time
   * is baked in (the HUD doesn't live-detect it), per Ian. */
  thisRun: number;
  /** cone hits on this run — drawn as N cone icons at the row's right edge (a
   * literal depiction, one icon per cone, not a number). The full/final count
   * is baked in; Ian decides in the edit when each cone actually appears. */
  cones?: number;
  /** which discipline's row width to use (track/autocross/rallycross). Default
   * "autocross". */
  event?: "track" | "autocross" | "rallycross";
  /** the racer's board state. Default leader (P1) — the THIS RUN endcap then
   * reads green, per the real leader/featured endcap color rule. */
  state?: RowState;
  /** seconds to hold on the final time after the count-up completes. Default 1. */
  holdSeconds?: number;
};
