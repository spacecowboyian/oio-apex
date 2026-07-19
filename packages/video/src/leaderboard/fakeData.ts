import { EventType } from "./types";

/** Deterministic per-seed PRNG — same size always generates the same roster,
 * so switching an unrelated control doesn't reshuffle the data underneath you. */
const mulberry32 = (seed: number) => {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Jamie", "Drew",
  "Cameron", "Reese", "Skyler", "Avery", "Quinn", "Rowan", "Emerson", "Finley",
];
const LAST_NAMES = [
  "Bennett", "Carter", "Diaz", "Ellis", "Foster", "Grant", "Hayes", "Irwin",
  "Jensen", "Kerr", "Lang", "Moss", "Nash", "Ortiz", "Pierce", "Quade",
];
const CARS = [
  "'95 Miata", "'02 WRX", "'11 Fit", "'88 CRX", "'99 Civic Si", "'07 S2000",
  "'85 MR2", "'13 BRZ", "'01 Focus SVT", "'92 Integra",
];

export const DATASET_SIZES = { short: 5, medium: 9, long: 16 } as const;
/** run count scales with the size tier too — short/medium/long previously
 * only varied roster size (5/9/16 racers) while every tier generated exactly
 * 6 runs each, which reads as a bug (three "different" presets producing
 * identical run counts) since the names imply event length, not just
 * headcount. */
export const DATASET_RUN_COUNTS = { short: 3, medium: 6, long: 9 } as const;
export type DatasetSize = keyof typeof DATASET_SIZES;

/**
 * Invented roster for quick what-if testing at a given scale — not tied to
 * any real event. Racer at index 1 and index min(4, n-1) are always fixed,
 * memorable names ("Jordan Bennett" / "Casey Foster") regardless of size, so
 * a `featured` list built from those two stays valid across every size.
 */
export const generateFakeRacers = (
  eventType: EventType,
  n: number,
  runCount: number = DATASET_RUN_COUNTS.medium,
): { name: string; car: string; runs: number[]; total?: number }[] => {
  const rand = mulberry32(n * 7919 + 17);
  const racers = [];
  for (let i = 0; i < n; i++) {
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 5 + 2) % LAST_NAMES.length]}`;
    const car = CARS[(i * 3) % CARS.length];
    const baseline = 42 + i * 1.35 + rand() * 1.2;
    const runs = Array.from({ length: runCount }, () =>
      Math.round((baseline + rand() * 3.2) * 1000) / 1000,
    );
    racers.push({ name, car, runs });
  }
  if (eventType === "rallycross") {
    return racers.map((r) => ({
      ...r,
      total: Math.round(r.runs.reduce((sum, x) => sum + x, 0) * 1000) / 1000,
    }));
  }
  return racers;
};

/** the two fixed anchor names from `generateFakeRacers`, valid for any size >= 2. */
export const fakeFeaturedNames = (n: number): string[] => {
  const idxA = 1;
  const idxB = Math.min(4, n - 1);
  const nameAt = (i: number) =>
    `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 5 + 2) % LAST_NAMES.length]}`;
  return Array.from(new Set([nameAt(idxA), nameAt(idxB)]));
};
