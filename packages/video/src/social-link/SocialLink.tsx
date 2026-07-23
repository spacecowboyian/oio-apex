import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { cornerLabel, fontStack } from "../theme";
import { SocialLinkProps } from "./types";
import { SOCIAL_GLYPHS } from "./glyphs";
import { IconKnockoutBox } from "../corner-label/IconKnockoutBox";
import { HERO_FONT_PX, padX, padY } from "../corner-label/sizing";
import { cornerLabelStaging, computeCornerLabelDuration, computeCornerLabelHeldFrame, DEFAULT_HOLD_SECONDS } from "../corner-label/staging";

/** the social-link chips read a little heavy at the full reference size — 0.75x
 * the hero corner-label size, per Ian. */
const SOCIAL_FONT_SCALE = 0.75;

// Social links always enter from the left: icon box on the outer/left edge,
// handle revealing to its right (issue #1).
const ANCHOR = "left" as const;

/**
 * Social-link corner label (spacecowboyian/oio-apex #1). A preset over the
 * shared corner-label engine (corner-label/staging.ts) — same box-swipe /
 * word-reveal-from-behind choreography as `LowerThird`, but the box holds a
 * brand-mark icon knockout instead of text, and the revealed word is the
 * handle (optionally preceded by a slash separator).
 *
 * `[icon box] / HANDLE` for a platform handle; `[icon box] HANDLE` (no slash)
 * for a plain website URL. The slash sits plain (no background), same as the
 * handle, just between the two.
 */
export const SocialLink: React.FC<SocialLinkProps> = ({
  platform,
  handle,
  surface = "dark",
  holdSeconds = DEFAULT_HOLD_SECONDS,
  placement = "bottom",
  safeInsetPx = 0,
  scrim = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palette = surface === "dark" ? cornerLabel.onDark : cornerLabel.onLight;
  const fontFamily = fontStack("helvetica");
  const fontPx = HERO_FONT_PX * SOCIAL_FONT_SCALE;
  const pY = padY(fontPx);
  const pX = padX(fontPx);
  const onTop = placement === "top";
  const showSlash = platform !== "website";
  const Glyph = SOCIAL_GLYPHS[platform];

  const { gradientShown, boxShown, boxTranslateX, wordTranslatePct } = cornerLabelStaging({
    frame,
    fps,
    anchor: ANCHOR,
    holdSeconds,
  });

  const wordBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    lineHeight: 1,
    fontFamily,
    fontWeight: 700,
    fontSize: fontPx,
    padding: `${pY}px ${pX}px`,
    color: palette.plainColor,
  };

  const boxElement = (
    <div style={{ transform: `translateX(${boxTranslateX}px)`, opacity: boxShown }}>
      <IconKnockoutBox glyph={<Glyph />} boxBg={palette.boxBg} fontSizePx={fontPx} paddingYPx={pY} />
    </div>
  );

  // the slash (when shown) + handle reveal together from behind the icon box —
  // one clipped group sliding out from the box's right edge, same mechanism as
  // LowerThird's single-word reveal.
  const wordElement = (
    <div style={{ overflow: "hidden" }}>
      <span style={{ display: "inline-flex", alignItems: "center", transform: `translateX(${wordTranslatePct}%)` }}>
        {showSlash && <span style={{ ...wordBase, paddingLeft: pX * 0.5, paddingRight: pX * 0.5 }}>/</span>}
        <span style={{ ...wordBase, paddingLeft: showSlash ? 0 : pX }}>{handle}</span>
      </span>
    </div>
  );

  return (
    <AbsoluteFill>
      {scrim && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            [onTop ? "top" : "bottom"]: 0,
            height: "24%",
            background: `linear-gradient(${onTop ? "0deg" : "180deg"}, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.8) 100%)`,
            opacity: gradientShown,
          }}
        />
      )}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: onTop ? "flex-start" : "flex-end",
          alignItems: "flex-start",
          paddingTop: onTop ? safeInsetPx : 64,
          paddingBottom: onTop ? 64 : safeInsetPx,
          paddingLeft: 64,
          paddingRight: 64,
        }}
      >
        {/* icon box on the left (anchored/outer edge), handle revealing to its right */}
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
          {boxElement}
          {wordElement}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// the social-link label rides the shared corner-label timeline, so its
// duration/held-frame come straight from the core.
export const computeSocialLinkDuration = computeCornerLabelDuration;
export const computeSocialLinkHeldFrame = computeCornerLabelHeldFrame;
