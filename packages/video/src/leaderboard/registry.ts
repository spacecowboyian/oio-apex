import { LeaderboardConfig } from "./types";

/**
 * The Playground's saved data + options registries (issue #13 follow-up).
 *
 * A `LeaderboardConfig` cleanly splits into two independent halves:
 *   - DATA (a "dataset") — what changes per event: `eventType`, `title`,
 *     `racers`, and the roster-specific `highlightMode`/`featured`. This is the
 *     ONLY part a results-page import ever produces.
 *   - OPTIONS (a "preset") — presentation/pacing that's reusable across events:
 *     safe margins, `showRank`, `heroRunLabel`, `finalResults`, frame size, etc.
 *     Deliberately carries NO racer identity, so any preset pairs with any
 *     dataset of a compatible eventType.
 *
 * Picking a dataset + a preset in the Playground merges them (data wins on the
 * identity fields) into one config that BOTH the standard board and the
 * short-form run-by-run recap render — same data, two looks, no re-entry.
 *
 * To SAVE a new one: drop a JSON in `leaderboard-configs/datasets/` (data-only)
 * or `leaderboard-configs/presets/` (options-only) and add one import + one map
 * entry below. (Static imports, not a glob — the repo's `tsc` lint gate has no
 * Vite `import.meta.glob` types.) The Playground's pickers pick it up from the
 * exported id lists automatically.
 */

/** Data-only slice: the event + roster. Everything a results import produces. */
export type DatasetData = Pick<LeaderboardConfig, "eventType" | "title" | "highlightMode" | "featured" | "racers">;

/** Options-only slice: presentation + pacing, no racer identity. `throughRun`/
 * `previousThroughRun` are excluded on purpose — those are the Playground's own
 * run-selector controls, not a saved look. */
export type PresetOptions = Omit<LeaderboardConfig, keyof DatasetData | "throughRun" | "previousThroughRun">;

import kcrRallycrossMr from "../../leaderboard-configs/datasets/kcr-rallycross-mr.json";
import estAutocrossEvent4 from "../../leaderboard-configs/datasets/est-autocross-event-4.json";
import trackExample from "../../leaderboard-configs/datasets/track-example.json";

import shortFormVertical from "../../leaderboard-configs/presets/short-form-vertical.json";
import standardLandscape from "../../leaderboard-configs/presets/standard-landscape.json";
import finalResultsFeatured from "../../leaderboard-configs/presets/final-results-featured.json";

/** Saved datasets, keyed by the id shown in the Playground's `datasetId` picker. */
export const DATASETS: Record<string, DatasetData> = {
  "kcr-rallycross-mr": kcrRallycrossMr as unknown as DatasetData,
  "est-autocross-event-4": estAutocrossEvent4 as unknown as DatasetData,
  "track-example": trackExample as unknown as DatasetData,
};

/** Saved option presets, keyed by the id shown in the Playground's `presetId` picker. */
export const PRESETS: Record<string, PresetOptions> = {
  "short-form-vertical": shortFormVertical as unknown as PresetOptions,
  "standard-landscape": standardLandscape as unknown as PresetOptions,
  "final-results-featured": finalResultsFeatured as unknown as PresetOptions,
};

/** `"manual"` = drive data from the individual racers/event controls instead of a saved dataset. */
export const DATASET_IDS = ["manual", ...Object.keys(DATASETS)] as const;
/** `"custom"` = drive options from the individual option controls instead of a saved preset. */
export const PRESET_IDS = ["custom", ...Object.keys(PRESETS)] as const;
