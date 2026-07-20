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

/** The run immediately before the most recent one — `null` if there isn't
 * one yet (a racer's very first run). Powers the PREVIOUS/CURRENT column
 * pair (`showPreviousCurrentRuns`): the two runs actually being compared in
 * a given leg's transition, not best-ever/most-recent. */
export const secondLastOf = (runs: number[]): number | null => (runs.length >= 2 ? runs[runs.length - 2] : null);

/** Total cone hits across every run so far — `cones` is optional and
 * treated as all-zero when absent (a clean-sheet racer, or cone data not
 * tracked for this event). */
export const totalCones = (cones: number[] | undefined): number => (cones ?? []).reduce((sum, c) => sum + c, 0);
