import React from "react";
import { AbsoluteFill } from "remotion";
import { fontStack } from "../theme";
import { CaptionCardProps } from "./types";

/** Sized for legibility across both a phone and a TV without being
 * "ginormous" — noticeably smaller than the old CTA card's heading (that was
 * the complaint that killed it), landing near the brand's body-caption range,
 * per Ian. */
const CAPTION_FONT_PX = 72;

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
export const CaptionCard: React.FC<CaptionCardProps> = ({ text }) => {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 80,
      }}
    >
      <div
        style={{
          // hugs the text (inline-block, not full-width), one line
          display: "inline-block",
          background: "rgba(0,0,0,0.72)",
          color: "white",
          padding: "28px 64px",
          fontFamily: fontStack("helvetica"),
          fontWeight: 700,
          fontSize: CAPTION_FONT_PX,
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
