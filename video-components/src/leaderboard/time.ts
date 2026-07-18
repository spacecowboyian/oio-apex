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
