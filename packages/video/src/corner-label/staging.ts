import { interpolate, spring } from "remotion";

/**
 * The shared choreography core for corner labels (spacecowboyian/oio-apex #3).
 *
 * Every corner-label variant — the bottom `LowerThird` (text box), the
 * top-corner event/venue tags, the social-link label (icon box) — animates
 * in/out the same way: a gradient scrim fades in, a box swipes in from the
 * anchored edge and holds, then the unboxed word reveals from behind it;
 * exit reverses at twice the speed. That timeline lives here once, so each
 * variant is a thin preset that renders its own box/word using these values
 * rather than re-implementing the motion design.
 *
 * This is pure math (no React, no `useCurrentFrame`) — the caller passes the
 * current frame in, so it's equally usable from a component or from the
 * `computeMetadata` duration helpers below.
 */

/** drawer-style spring, same feel as LeaderboardShell's card in/out (damping
 * 200) — corner labels reuse that grammar rather than inventing new motion. */
export const SPRING_CONFIG = { damping: 200 };

/** the scrim/vignette fades in first — animate-in is staged, not simultaneous. */
export const GRADIENT_IN_FRAMES = 12;

/** box slide-in duration, and the gap it holds before the standalone word
 * starts to reveal ("the rectangle for a beat, then the standalone word"). */
export const BOX_IN_FRAMES = 14;
export const HOLD_BEFORE_WORD_FRAMES = 16;
export const WORD_REVEAL_FRAMES = 14;
export const DEFAULT_HOLD_SECONDS = 3;

/** exit reverses the order (word hides, then the box slides away) at twice the
 * entrance speed, and with no gap — the box starts sliding out the instant the
 * word finishes tucking back behind it. */
export const WORD_HIDE_FRAMES = WORD_REVEAL_FRAMES / 2;
export const BOX_OUT_FRAMES = BOX_IN_FRAMES / 2;

/** how far past the frame edge the box starts/ends, in px — a generous fixed
 * distance (not measured), sized to clear the box at hero reading size. */
export const TRAVEL_PX = 900;

const stageProgress = (frame: number, start: number, durationInFrames: number, fps: number): number =>
  frame < start ? 0 : spring({ fps, frame: frame - start, config: SPRING_CONFIG, durationInFrames });

export type StagingInput = {
  frame: number;
  fps: number;
  /** which edge the box is anchored to — drives the box/word slide direction. */
  anchor: "left" | "right";
  holdSeconds?: number;
};

export type Staging = {
  /** opacity of the scrim/vignette, 0..1 (the caller decides whether to draw one). */
  gradientShown: number;
  /** opacity of the box, 0..1. */
  boxShown: number;
  /** opacity of the reveal-from-behind word, 0..1. */
  wordShown: number;
  /** px the box is translated along X (off-edge → 0 at rest). */
  boxTranslateX: number;
  /** % of its own width the word is translated (±100 hidden behind the box → 0 revealed). */
  wordTranslatePct: number;
};

const timeline = (holdSeconds: number, fps: number) => {
  const boxInStart = GRADIENT_IN_FRAMES;
  const wordInStart = boxInStart + BOX_IN_FRAMES + HOLD_BEFORE_WORD_FRAMES;
  const wordOutStart = wordInStart + WORD_REVEAL_FRAMES + holdSeconds * fps;
  const boxOutStart = wordOutStart + WORD_HIDE_FRAMES;
  const exitEnd = boxOutStart + BOX_OUT_FRAMES;
  return { boxInStart, wordInStart, wordOutStart, boxOutStart, exitEnd };
};

/**
 * The animation state of a corner label at `frame`. Identical math for every
 * variant; only what gets rendered (text box vs icon box, one word vs a
 * slash+handle group) differs per preset.
 */
export const cornerLabelStaging = ({ frame, fps, anchor, holdSeconds = DEFAULT_HOLD_SECONDS }: StagingInput): Staging => {
  const { wordOutStart, boxOutStart, exitEnd } = timeline(holdSeconds, fps);
  const boxInStart = GRADIENT_IN_FRAMES;
  const wordInStart = boxInStart + BOX_IN_FRAMES + HOLD_BEFORE_WORD_FRAMES;

  // the scrim fades in on its own beat, but fades out across the whole exit
  // span (word hiding through box sliding away) — one dissolve, not a stage of
  // its own, matching "animate out all together."
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
  // own width, so it needs no measurement — 100% is exactly "fully behind the
  // box's adjacent edge," 0% is "fully revealed at rest."
  const wordHiddenPct = anchor === "left" ? -100 : 100;
  const wordTranslatePct = interpolate(wordShown, [0, 1], [wordHiddenPct, 0]);

  return { gradientShown, boxShown, wordShown, boxTranslateX, wordTranslatePct };
};

/** total frame count of the animation, for a Composition's `calculateMetadata`. */
export const computeCornerLabelDuration = (holdSeconds: number = DEFAULT_HOLD_SECONDS, fps = 30): number => {
  const { boxOutStart } = timeline(holdSeconds, fps);
  return Math.ceil(boxOutStart + BOX_OUT_FRAMES);
};

/** the frame at which the label is fully revealed and settled — box and word
 * both at rest, exit not yet started. Storybook uses this to show a static
 * "what it looks like fully out" preview alongside the animated player. */
export const computeCornerLabelHeldFrame = (): number => {
  const boxInStart = GRADIENT_IN_FRAMES;
  const wordInStart = boxInStart + BOX_IN_FRAMES + HOLD_BEFORE_WORD_FRAMES;
  return Math.ceil(wordInStart + WORD_REVEAL_FRAMES);
};
