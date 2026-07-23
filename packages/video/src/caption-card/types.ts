/**
 * Data contract for the burned-in caption card (spacecowboyian/oio-apex #4).
 * Forced captions for dialogue that's hard to hear — one line, hugging the
 * text, the brand guide's translucent-black-box move, bottom-center.
 */
export type CaptionCardProps = {
  /** the caption line. Sentence case, NOT all-caps — the one exception to the
   * house all-caps rule, since this reads as natural dialogue/subtitles, not a
   * graphic label. Rendered verbatim (the caller writes the casing). */
  text: string;
  /** seconds the caption holds fully on screen between its fade in and out.
   * Default 2.5. Ian decides the actual on-screen timing in the edit; this is
   * just the self-contained clip length. */
  holdSeconds?: number;
};
