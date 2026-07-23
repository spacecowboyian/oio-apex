/**
 * Data contract for the event date/time corner label (spacecowboyian/oio-apex
 * #2). A top-right-anchored corner label — the same fact/name/box grammar as
 * the bottom `LowerThird`, just a different corner and a smaller size. See
 * HANDOFF.md §Corner labels and the design sketch (`EventDateSketch` in
 * design-sketches/BacklogSketches.stories.tsx) for the locked design.
 */
export type EventDateProps = {
  /** region + discipline code — e.g. `KCRX` / `KCAX` / `KSRX`, no space, no
   * event number ("the date says enough," per Ian). Sits in the box on the
   * outer/right frame edge. */
  code: string;
  /** event date as ISO `YYYY-MM-DD`. Rendered `MONTH.DAY.YEAR`, dot-separated,
   * 2-digit year — `JULY.19.26` — the same "2-digit year only" convention as
   * the car-fact rule (decisions/oio-apex/corner-label-rule.md). Sits as the
   * plain (unboxed) word, inward of the box. */
  dateISO: string;
  /** seconds the tag holds fully on screen before exiting. Default 3, matching
   * `LowerThird`. */
  holdSeconds?: number;
};
