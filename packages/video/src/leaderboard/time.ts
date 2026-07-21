/** Formats seconds (e.g. 62.258) as "M:SS.mmm" once past a minute, else "SS.mmm". */
export const formatRunTime = (seconds: number): string => {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const rest = seconds - m * 60;
    return `${m}:${rest.toFixed(3).padStart(6, "0")}`;
  }
  return seconds.toFixed(3);
};

/** The quickest run — the component derives this, callers never provide it directly. */
export const fastestOf = (runs: number[]): number => Math.min(...runs);

/** The most recent run — assumes `runs` is in chronological order, oldest first. */
export const lastOf = (runs: number[]): number => runs[runs.length - 1];

/** A time gap, explicitly signed — e.g. "+2.345". For a racer's `gapToLeader`
 * (see `RankedRallycrossRacer` in runProgress.ts): how far behind the
 * overall leader's cumulative total this racer currently is. */
export const formatGap = (seconds: number): string => `+${formatRunTime(seconds)}`;

/** Total cone hits across every run so far — `cones` is optional and
 * treated as all-zero when absent (a clean-sheet racer, or cone data not
 * tracked for this event). */
export const totalCones = (cones: number[] | undefined): number => (cones ?? []).reduce((sum, c) => sum + c, 0);

/** Total missed gates across every run so far — same optionality/shape rule as `totalCones`. */
export const totalMissedGates = (missedGates: number[] | undefined): number =>
  (missedGates ?? []).reduce((sum, c) => sum + c, 0);
