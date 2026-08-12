import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { cornerLabel, fontStack } from "../theme";
import { LowerThirdProps } from "./types";
import { KnockoutBox } from "./KnockoutBox";
import {
  cornerLabelStaging,
  computeCornerLabelDuration,
  computeCornerLabelHeldFrame,
  DEFAULT_HOLD_SECONDS,
} from "../corner-label/staging";
import { HERO_FONT_PX } from "../corner-label/sizing";

/** the hero (broadcast) size; `fontScale` multiplies it for smaller presets
 * (e.g. the top-corner event/venue tags at 0.6x). */
const FONT_PX = HERO_FONT_PX;

/**
 * Animated corner label for presenting a person/car as a lower third. A preset
 * over the shared corner-label choreography (see corner-label/staging.ts):
 * the bottom vignette (the same gradient scrim as the brand guide's
 * corner-label backdrop, HANDOFF.md §Corner labels) fades in first, then the
 * boxed fact/name swipes in and holds, then the standalone (unboxed) word
 * reveals from behind it; exit reverses at twice the entrance speed. The boxed
 * text is a true knockout (see KnockoutBox): letters are cut from the box, not
 * colored, so the real backdrop shows through — never the standalone word,
 * which never occupies the box's footprint (it's revealed via an adjacent
 * clip, not literally slid underneath).
 */
export const LowerThird: React.FC<LowerThirdProps> = ({
  fact: rawFact,
  name: rawName,
  anchor,
  surface,
  holdSeconds = DEFAULT_HOLD_SECONDS,
  placement = "bottom",
  // matches the flat 64px side inset (and TAG_TOP_INSET_PX) so the broadcast
  // preset sits off all four frame edges by the same amount — flush-to-edge
  // (0) was never actually right for the default "bottom" case; short-form
  // callers that need a platform-specific safe area (reels UI chrome) still
  // pass their own value explicitly, e.g. brand-video.mjs's "top" placement.
  safeInsetPx = 64,
  scrim = true,
  scrimHeightPct = 24,
  fontScale = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palette = surface === "dark" ? cornerLabel.onDark : cornerLabel.onLight;
  const fontFamily = fontStack("helvetica");
  // base hero size scaled down for smaller presets; padding stays proportional
  // to the glyph (same 0.32/0.55 fractions the design sketch uses).
  const fontPx = FONT_PX * fontScale;
  const paddingYPx = 0.32 * fontPx;
  const paddingXPx = 0.55 * fontPx;
  const onTop = placement === "top";

  const { gradientShown, boxShown, boxTranslateX, wordTranslatePct } = cornerLabelStaging({
    frame,
    fps,
    anchor,
    holdSeconds,
  });

  /**
   * House rule (Ian, 2026-07-23): corner labels are ALWAYS all-caps, whatever
   * casing the caller passes. Uppercased here rather than left to callers so a
   * hand-written prop, a config file, and a scripted render can't disagree — and
   * before any text measurement, since the box is sized from the measured string
   * and caps are wider.
   */
  const fact = rawFact.toUpperCase();
  const name = rawName.toUpperCase();

  // box is always whichever field sits on the anchored/outer edge (fact for
  // anchor="left", name for anchor="right") — the box's slide transform must
  // stay attached to that element regardless of which side it's on.
  const boxElement = (
    <div style={{ transform: `translateX(${boxTranslateX}px)`, opacity: boxShown }}>
      <KnockoutBox
        text={anchor === "left" ? fact : name}
        boxBg={palette.boxBg}
        fontFamily={fontFamily}
        fontSizePx={fontPx}
        paddingYPx={paddingYPx}
        paddingXPx={paddingXPx}
      />
    </div>
  );

  const wordElement = (
    <div style={{ overflow: "hidden" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          whiteSpace: "nowrap",
          lineHeight: 1,
          fontFamily,
          fontWeight: 700,
          fontSize: fontPx,
          padding: `${paddingYPx}px ${paddingXPx}px`,
          color: palette.plainColor,
          transform: `translateX(${wordTranslatePct}%)`,
        }}
      >
        {anchor === "left" ? name : fact}
      </span>
    </div>
  );

  // DOM order is always fact-then-name (per the corner-label rule, HANDOFF.md
  // §Corner labels) — only which side is boxed changes with anchor.
  const [factSlot, nameSlot] = anchor === "left" ? [boxElement, wordElement] : [wordElement, boxElement];

  return (
    <AbsoluteFill>
      {/* vignette — same gradient as the brand guide's `.z-vignette`
          (HANDOFF.md §Corner labels): a consistent dark base for the label
          regardless of what's behind it. Sits on the same edge the lockup is
          placed on, and the gradient darkens toward that edge. Short-form posts
          run scrim={false} and rely on a surface (light/dark) picked from the
          footage instead — Ian, 2026-07-21.

          The height (`scrimHeightPct`, default 24) only ever worked for a label
          sitting near its anchored edge. The short-form recipe pushes the label
          down a large `safeInsetPx` (~400 on a 1080x1920 master, to clear the
          FB/IG feed top crop), and at 24 the gradient reached alpha 0.10 at the
          label's top edge and 0.00 at its bottom — i.e. the scrim did not cover
          the label at all. That, not the scrim being a bad idea, is why
          short-form ran `scrim={false}` from 2026-07-21: it was never earning
          its keep because it never got there. Short-form now passes 48, which
          restores real coverage at that inset (0.44 top / 0.35 bottom) and is
          what makes a white (surface="dark") label legible over bright footage
          — its letters are a true knockout, so without a scrim they take
          whatever is behind them (Ian, 2026-07-31).

          Kept as a per-caller prop rather than raised globally: the recap
          overlay (recap-render.mjs) also runs scrim={true} placement="top" but
          at safeInsetPx 20, where the label is already inside the default 24
          and a global bump would just darken half its footage box for nothing.
          The height is NOT derived from `safeInsetPx`, so the two stay coupled
          by hand — change the inset and re-measure a rendered frame rather than
          trusting this number. */}
      {scrim && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            [onTop ? "top" : "bottom"]: 0,
            height: `${scrimHeightPct}%`,
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
          alignItems: anchor === "left" ? "flex-start" : "flex-end",
          // `safeInsetPx` insets from the placement edge (clears reels/shorts UI);
          // the flat 64 stays on the other three sides.
          paddingTop: onTop ? safeInsetPx : 64,
          paddingBottom: onTop ? 64 : safeInsetPx,
          paddingLeft: 64,
          paddingRight: 64,
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
          {factSlot}
          {nameSlot}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Backward-compatible aliases — the choreography's duration math now lives in
// the shared corner-label core, but existing callers (Root.tsx, the stories,
// the event/venue tag presets) import these names from here.
export const computeLowerThirdDuration = computeCornerLabelDuration;
export const computeLowerThirdHeldFrame = computeCornerLabelHeldFrame;
