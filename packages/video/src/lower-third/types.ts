/**
 * Data contract for the animated corner-label lower third — used to present a
 * person or car on screen. Reuses the same fact/name split as the static
 * `CornerLabel` (see foundations/CornerLabel.tsx and HANDOFF.md §Corner
 * labels): left = fact (year/make/model or role), right = name/sub-fact,
 * box always on the outer frame edge.
 */
export type LowerThirdProps = {
  /** left part = fact (year/make/model or event category) */
  fact: string;
  /** right part = name/sub-fact */
  name: string;
  /** which side of the frame this label is anchored to — the box always sits on the outer edge */
  anchor: "left" | "right";
  /** photo tone behind the label — drives which side gets the contrasting box */
  surface: "dark" | "light";
  /** frame the label holds fully on screen before exiting, at 30fps. Default 3s. */
  holdSeconds?: number;
  /** which frame edge the whole lockup sits on. Default "bottom" (broadcast).
   * "top" is for vertical shorts/reels, where the bottom is buried under the
   * platform's caption/action UI — see `safeInsetPx`. */
  placement?: "top" | "bottom";
  /** px to inset the lockup from its placement edge, to clear the social app's
   * UI chrome (e.g. the notch/top bar on reels). Applied as the top/bottom
   * padding; the flat 64px stays on the other three sides. Default 0. */
  safeInsetPx?: number;
  /** draw the scrim gradient behind the label. Default true (broadcast). Set
   * false for short-form, where the label instead relies on a `surface`
   * (light/dark) picked from the footage for contrast — no gradient. */
  scrim?: boolean;
};

/**
 * No reduced-motion fallback by design: this renders into a baked video file,
 * not a live page — there's no OS preference to read at playback time. If
 * this component is ever driven live (e.g. a real-time overlay), that's a
 * new use case to design for, not an oversight in this one.
 */

/**
 * One entry in a batch — the JSON contract for generating a whole video's
 * worth of lower thirds at once (see lower-third-configs/*.json for worked
 * examples). `id` is optional: when omitted, the batch UI derives a filename
 * from `fact`/`name`; set it to disambiguate two entries that would
 * otherwise slugify to the same name.
 */
export type LowerThirdBatchItem = LowerThirdProps & { id?: string };
