import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { cornerLabel, fontStack, type } from "../theme";
import { LowerThirdProps } from "./types";
import { KnockoutBox } from "./KnockoutBox";

/** drawer-style spring, same feel as LeaderboardShell's card in/out (damping
 * 200) — this label reuses that grammar rather than inventing new motion. */
const SPRING_CONFIG = { damping: 200 };

/** the bottom vignette fades in first — animate-in is staged, not simultaneous. */
const GRADIENT_IN_FRAMES = 12;

/** box slide-in duration, and the gap it holds before the standalone word starts
 * to reveal ("the rectangle for a beat, then the standalone word"). */
const BOX_IN_FRAMES = 14;
const HOLD_BEFORE_WORD_FRAMES = 16;
const WORD_REVEAL_FRAMES = 14;
const DEFAULT_HOLD_SECONDS = 3;

/** exit reverses the order (word hides, then the box slides away) at twice
 * the entrance speed, and with no gap — the box starts sliding out the
 * instant the word finishes tucking back behind it. */
const WORD_HIDE_FRAMES = WORD_REVEAL_FRAMES / 2;
const BOX_OUT_FRAMES = BOX_IN_FRAMES / 2;

/** how far past the frame edge the box starts/ends, in px — a generous fixed
 * distance (not measured), sized to clear the box at 3x reading size. */
const TRAVEL_PX = 900;

/** 3x the standard h5 corner-label size — the previous size read as
 * illegible at broadcast viewing distance. */
const FONT_PX = parseFloat(type.scale.h5) * 16 * 3;

const stageProgress = (frame: number, start: number, durationInFrames: number, fps: number): number =>
  frame < start ? 0 : spring({ fps, frame: frame - start, config: SPRING_CONFIG, durationInFrames });

/**
 * Animated corner label for presenting a person/car as a lower third.
 * Animate-in is staged: the bottom vignette (the same gradient scrim as the
 * brand guide's corner-label backdrop, HANDOFF.md §Corner labels — gives the
 * label a consistent dark base regardless of what the footage behind it
 * looks like) fades in first, then the boxed fact/name swipes in and holds,
 * then the standalone (unboxed) word reveals from behind it. Animate-out is
 * simultaneous instead of staged: the vignette dissolves together with the
 * label's own exit (word hides behind the box, then the box slides away, at
 * twice the entrance speed) rather than waiting its turn. The boxed text is
 * a true knockout (see KnockoutBox): letters are cut from the box, not
 * colored, so the real backdrop shows through — never the standalone word,
 * which never occupies the box's footprint (it's revealed via an adjacent
 * clip, not literally slid underneath).
 */
export const LowerThird: React.FC<LowerThirdProps> = ({
  fact,
  name,
  anchor,
  surface,
  holdSeconds = DEFAULT_HOLD_SECONDS,
  placement = "bottom",
  safeInsetPx = 0,
  scrim = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palette = surface === "dark" ? cornerLabel.onDark : cornerLabel.onLight;
  const fontFamily = fontStack("helvetica");
  const paddingYPx = 0.32 * FONT_PX;
  const paddingXPx = 0.55 * FONT_PX;
  const onTop = placement === "top";

  const boxInStart = GRADIENT_IN_FRAMES;
  const wordInStart = boxInStart + BOX_IN_FRAMES + HOLD_BEFORE_WORD_FRAMES;
  const wordOutStart = wordInStart + WORD_REVEAL_FRAMES + holdSeconds * fps;
  const boxOutStart = wordOutStart + WORD_HIDE_FRAMES;
  const exitEnd = boxOutStart + BOX_OUT_FRAMES;

  // the vignette fades in on its own beat, but fades out across the whole
  // exit span (word hiding through box sliding away) — one dissolve, not a
  // stage of its own, matching "animate out all together."
  const gradientIn = stageProgress(frame, 0, GRADIENT_IN_FRAMES, fps);
  const gradientOut = stageProgress(frame, wordOutStart, exitEnd - wordOutStart, fps);
  const gradientShown = gradientIn * (1 - gradientOut);

  const boxIn = stageProgress(frame, boxInStart, BOX_IN_FRAMES, fps);
  const boxOut = stageProgress(frame, boxOutStart, BOX_OUT_FRAMES, fps);
  const boxShown = boxIn * (1 - boxOut);

  const wordIn = stageProgress(frame, wordInStart, WORD_REVEAL_FRAMES, fps);
  const wordOut = stageProgress(frame, wordOutStart, WORD_HIDE_FRAMES, fps);
  const wordShown = wordIn * (1 - wordOut);

  const boxOffX = anchor === "left" ? -TRAVEL_PX : TRAVEL_PX;
  const boxTranslateX = interpolate(boxShown, [0, 1], [boxOffX, 0]);

  // word wrapper clips via overflow:hidden; translateX is a % of the word's
  // own width, so it needs no measurement — 100% is exactly "fully behind
  // the box's adjacent edge," 0% is "fully revealed at rest."
  const wordHiddenPct = anchor === "left" ? -100 : 100;
  const wordTranslatePct = interpolate(wordShown, [0, 1], [wordHiddenPct, 0]);

  // box is always whichever field sits on the anchored/outer edge (fact for
  // anchor="left", name for anchor="right") — the box's slide transform must
  // stay attached to that element regardless of which side it's on.
  const boxElement = (
    <div style={{ transform: `translateX(${boxTranslateX}px)`, opacity: boxShown }}>
      <KnockoutBox
        text={anchor === "left" ? fact : name}
        boxBg={palette.boxBg}
        fontFamily={fontFamily}
        fontSizePx={FONT_PX}
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
          fontSize: FONT_PX,
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
      {/* vignette — same gradient/height as the brand guide's `.z-vignette`
          (HANDOFF.md §Corner labels): a consistent dark base for the label
          regardless of what's behind it. Sits on the same edge the lockup is
          placed on, and the gradient darkens toward that edge. Short-form posts
          run scrim={false} and rely on a surface (light/dark) picked from the
          footage instead — Ian, 2026-07-21. */}
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

export const computeLowerThirdDuration = (holdSeconds: number = DEFAULT_HOLD_SECONDS, fps = 30): number => {
  const boxInStart = GRADIENT_IN_FRAMES;
  const wordInStart = boxInStart + BOX_IN_FRAMES + HOLD_BEFORE_WORD_FRAMES;
  const wordOutStart = wordInStart + WORD_REVEAL_FRAMES + holdSeconds * fps;
  const boxOutStart = wordOutStart + WORD_HIDE_FRAMES;
  return Math.ceil(boxOutStart + BOX_OUT_FRAMES);
};

/** the frame at which the label is fully revealed and settled — box and word
 * both at rest, exit not yet started. Storybook uses this to show a static
 * "what it looks like fully out" preview alongside the animated player,
 * instead of making someone scrub the timeline to find it. */
export const computeLowerThirdHeldFrame = (): number => {
  const boxInStart = GRADIENT_IN_FRAMES;
  const wordInStart = boxInStart + BOX_IN_FRAMES + HOLD_BEFORE_WORD_FRAMES;
  return Math.ceil(wordInStart + WORD_REVEAL_FRAMES);
};
