/**
 * Data contract for the burned-in caption card (spacecowboyian/oio-apex #4).
 * Forced captions for dialogue that's hard to hear — one line, hugging the
 * text, the brand guide's translucent-black-box move, bottom-center.
 */
export type CaptionCardProps = {
  /** the caption line. Uppercased by the component, so the caller can pass
   * whatever casing it has. Follows the house all-caps rule as of 2026-07-23 —
   * the earlier sentence-case carve-out (on the theory that subtitles read as
   * dialogue, not as a graphic label) was reversed by Ian on seeing it over
   * real footage. */
  text: string;
  /** seconds the caption is on screen. Default 2.5. Cards hard-cut in and out
   * and replace each other, so this is the whole visible life of the card, not
   * a hold bracketed by fades. */
  holdSeconds?: number;
};
