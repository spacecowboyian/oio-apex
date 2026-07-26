import { PartsListConfig } from "./types";

/**
 * The Playground's saved data + options registries, mirroring the leaderboard's
 * `registry.ts` split so the two components are driven the same way.
 *
 *   - DATA (a "dataset") — the project: `title`, `items`, `segments`, `budget`.
 *     This is the only part a ledger import ever produces. `segments` belongs
 *     here because what got bought between two shoots is a fact about the
 *     project, not a look.
 *   - OPTIONS (a "preset") — orientation, frame size, row cap, pacing. Carries
 *     no project identity, so any preset pairs with any dataset.
 *
 * To save a new one: drop a JSON in `parts-list-configs/datasets/` (data only)
 * or `parts-list-configs/presets/` (options only) and add one import plus one
 * map entry below. Static imports rather than a glob — the repo's `tsc` lint
 * gate has no Vite `import.meta.glob` types (same reason the leaderboard's
 * registry lists them by hand).
 */

/** Data-only slice: the project and its ledger. */
export type DatasetData = Pick<PartsListConfig, "title" | "items" | "segments" | "budget">;

/** Options-only slice. `appearance` is excluded on purpose — that is the
 * Playground's own selector and the export panel's per-job field, not a saved
 * look. */
export type PresetOptions = Omit<PartsListConfig, keyof DatasetData | "appearance">;

import nessieExhaust from "../../parts-list-configs/datasets/nessie-exhaust.json";

import landscape from "../../parts-list-configs/presets/landscape.json";
import portrait from "../../parts-list-configs/presets/portrait.json";

/**
 * Saved datasets, keyed by the id the Playground's `datasetId` picker shows.
 *
 * `nessie-exhaust` is the real ledger for the 2.5" exhaust rebuild on the '82
 * Cressida wagon, from Brains `projects/cressida/parts-and-costs.md` with the
 * segment boundaries following the chronology in
 * `projects/nessie/exhaust-build-notes.md`. Two things about it are worth
 * knowing before the numbers get reused:
 *
 *  - It is the ELEVEN PURCHASED parts, $352.66. The ledger's own total of
 *    $490.66 also includes a Magnaflow muffler at an estimated $138 that Ian
 *    already owned and did not buy for this build. $352.66 is cash out of
 *    pocket, which is the honest figure to set against a shop quote.
 *  - The O'Reilly adapters line is Ian's estimate rather than a receipt, so it
 *    carries `est: true` and renders with a leading `≈`. The superseded 11.5"
 *    resonator is still on the list because the money was spent; Brains has an
 *    open question about whether it was returned.
 */
export const DATASETS: Record<string, DatasetData> = {
  "nessie-exhaust": nessieExhaust as unknown as DatasetData,
};

/** Saved option presets, keyed by the id the `presetId` picker shows. */
export const PRESETS: Record<string, PresetOptions> = {
  landscape: landscape as unknown as PresetOptions,
  portrait: portrait as unknown as PresetOptions,
};

/** `"manual"` = drive data from the individual item/segment/budget controls. */
export const DATASET_IDS = ["manual", ...Object.keys(DATASETS)] as const;
/** `"custom"` = drive options from the individual option controls. */
export const PRESET_IDS = ["custom", ...Object.keys(PRESETS)] as const;

/** Merge a dataset + preset into one config, data winning on identity fields. */
export const mergeConfig = (
  data: DatasetData,
  options: PresetOptions,
  appearance: PartsListConfig["appearance"],
): PartsListConfig => ({ ...options, ...data, appearance });
