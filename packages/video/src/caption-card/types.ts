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
  /** type size in px. One of `CAPTION_FONT_SIZES` (h2/h1/heroSm on the brand
   * scale); defaults to `DEFAULT_CAPTION_FONT_PX`.
   *
   * A caption SET must pick one size and use it for every card — never mix two
   * sizes in the same run of captions, per Ian. Use `fitCaptionFontSize` to
   * choose it from all the set's lines at once; it fits the worst line, so the
   * result holds for the rest. */
  fontSizePx?: number;
  /** px from the bottom of the frame to the bottom of the box. Defaults to the
   * `caption.safeArea` value for the frame's own orientation — the landscape
   * inset just clears the frame edge, the vertical one clears the reels/shorts
   * UI stack. Override per platform (`caption.safeArea.youtubeShorts` etc.)
   * only when reclaiming that space is worth a platform-specific render. */
  bottomOffsetPx?: number;
  /** seconds the caption is on screen. Default 2.5. Cards hard-cut in and out
   * and replace each other, so this is the whole visible life of the card, not
   * a hold bracketed by fades. */
  holdSeconds?: number;
  /** composition size, so one component serves both a landscape master and a
   * 1080x1920 short-form one. Defaults to 1920x1080; `calculateMetadata` in
   * Root.tsx resizes the composition to match. */
  frameWidth?: number;
  frameHeight?: number;
};
