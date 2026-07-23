import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { caption, fontStack } from "../theme";
import { CaptionCardProps } from "./types";

/**
 * Allowed caption sizes, largest last — steps on the brand type scale (h2 / h1
 * / heroSm), not arbitrary px. These live in `@oio/tokens` rather than here
 * because the Node captioning pipeline has to measure candidate line widths
 * before it renders anything, so it needs the same numbers without going
 * through React.
 */
export const CAPTION_FONT_SIZES = caption.fontSizes;

export const DEFAULT_CAPTION_FONT_PX = caption.defaultFontSize;

const PAD_Y_EM = caption.paddingYEm;
const PAD_X_EM = caption.paddingXEm;

/** Rendered width of the box around a line — text plus both gutters. */
export const captionBoxWidth = (textWidthPx: number, fontSizePx: number): number =>
  textWidthPx + 2 * PAD_X_EM * fontSizePx;

/**
 * The ONE size to use for a whole caption set: the largest step at which every
 * line in the set still fits `maxWidthPx`.
 *
 * Per Ian, a set never mixes sizes — cards that trade size card-to-card read as
 * a glitch rather than as emphasis, since the viewer has no way to know the
 * size is carrying no meaning. So the fit is a property of the SET, decided
 * against its worst line, not of each card. That is also why this takes all the
 * texts at once instead of offering a per-card fit that a caller could
 * accidentally apply line by line.
 *
 * `measure` is injected because the two callers live in different worlds: the
 * browser/Remotion side has canvas `measureText`, and the Node render pipeline
 * measures with @napi-rs/canvas against the real licensed Helvetica.
 *
 * Returns the smallest step when even that overflows — the caller is expected
 * to verify the rendered result and shorten its lines, since the card is
 * `whiteSpace: nowrap` and would otherwise clip silently.
 */
export const fitCaptionFontSize = (
  texts: string[],
  maxWidthPx: number,
  measure: (text: string, fontSizePx: number) => number,
): number => {
  const descending = [...CAPTION_FONT_SIZES].sort((a, b) => b - a);
  const fits = descending.find((size) =>
    texts.every((t) => captionBoxWidth(measure(t.toUpperCase(), size), size) <= maxWidthPx),
  );
  return fits ?? descending[descending.length - 1];
};

const DEFAULT_HOLD_SECONDS = 2.5;

/**
 * Burned-in caption card (spacecowboyian/oio-apex #4). One line, hugging the
 * text (not full-width) in the brand guide's signature translucent-black box
 * (`rgba(0,0,0,0.72)`), bottom-center.
 *
 * All-caps and hard-cut, per Ian 2026-07-23, reviewing the first real captioned
 * clip. Both reverse earlier calls made before there was footage to look at:
 *
 * - Casing was sentence case, carved out as "the one exception to the house
 *   all-caps rule" on the theory that subtitles read as dialogue rather than as
 *   a graphic label. On screen it just looked like a different brand's
 *   captions. It follows the house rule now. Tracking is left at Helvetica's
 *   default to match `.corner-label .cl-part` — the closest analog in the
 *   system (boxed uppercase Helvetica Bold) adds none, and the brand guide only
 *   reaches for letter-spacing on small caps like `.pill` (0.09em at 0.68rem).
 * - Cards used to fade in and out over 6 frames each. Back to back that reads
 *   as a stutter — every line dips to nothing and comes back — so they hard-cut
 *   and replace each other instead. This also makes `holdSeconds` mean exactly
 *   what it says: the whole time the card is on screen, with no fade padding
 *   bracketing it.
 */
export const CaptionCard: React.FC<CaptionCardProps> = ({
  text,
  fontSizePx = DEFAULT_CAPTION_FONT_PX,
  bottomOffsetPx,
}) => {
  // Orientation comes from the frame the card is actually rendering into, not
  // from a prop the caller has to remember to set — a vertical render that
  // silently kept the landscape 80px inset would bury every caption under the
  // reels/shorts UI, and nothing in the render would complain.
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const safe = vertical ? caption.safeArea.vertical : caption.safeArea.landscape;
  const bottom = bottomOffsetPx ?? safe.bottom;
  // Vertical anchors LEFT rather than centring: the platforms' action rail
  // (like/comment/share) runs down the right side ABOVE the bottom UI stack, so
  // a centred line that clears the bottom stack still ends up under the
  // buttons. See caption.alignNote in tokens.
  const alignLeft = (vertical ? caption.align.vertical : caption.align.landscape) === "left";

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: alignLeft ? "flex-start" : "center",
        paddingLeft: alignLeft ? safe.side : 0,
        paddingBottom: bottom,
      }}
    >
      <div
        style={{
          // hugs the text (inline-block, not full-width), one line
          display: "inline-block",
          background: caption.boxBg,
          color: "white",
          padding: `${PAD_Y_EM}em ${PAD_X_EM}em`,
          fontFamily: fontStack("helvetica"),
          fontWeight: 700,
          fontSize: fontSizePx,
          lineHeight: 1.1,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** Total frame count of the caption clip. The card cuts in and out, so this is
 * simply the hold — no fade frames bracketing it. */
export const computeCaptionDuration = (holdSeconds: number = DEFAULT_HOLD_SECONDS, fps = 30): number =>
  Math.max(1, Math.ceil(holdSeconds * fps));
