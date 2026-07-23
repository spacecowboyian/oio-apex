#!/usr/bin/env node
/**
 * Decide the ONE type size a caption set will use, and how many characters a
 * line may carry, by measuring against the real licensed Helvetica Bold.
 *
 * Measured, not estimated, because estimating is what put a 1652px line in a
 * 1620px frame: all-caps runs ~10% wider than mixed case, and the
 * per-character average shifts with which letters are involved. @napi-rs/canvas
 * gives the same metrics Chromium will — on a real render its predicted box
 * widths came back within 1px of what Remotion produced.
 *
 * Every number here comes from @oio/tokens, the same values CaptionCard.tsx
 * reads, so this cannot drift from what actually renders.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_DIR = path.resolve(HERE, "../../tokens");
const CAP = JSON.parse(fs.readFileSync(path.join(TOKENS_DIR, "tokens.json"), "utf8")).caption;

const FAMILY = "OIO Helvetica Bold";
GlobalFonts.registerFromPath(path.join(TOKENS_DIR, "fonts/HelveticaNeue-Bold.ttf"), FAMILY);
const ctx = createCanvas(8, 8).getContext("2d");

export const measureText = (text, sizePx) => {
  ctx.font = `700 ${sizePx}px "${FAMILY}"`;
  return ctx.measureText(text).width;
};

/** rendered width of the box around a line — text plus both gutters */
export const boxWidth = (text, sizePx) =>
  measureText(text.toUpperCase(), sizePx) + 2 * CAP.paddingXEm * sizePx;

export const safeAreaFor = (orientation) => CAP.safeArea[orientation] ?? CAP.safeArea.landscape;

/**
 * Horizontal room a caption line actually has.
 *
 * Not simply "frame minus side margins". On vertical, the platforms' action
 * rail (like/comment/share) owns the right side ABOVE the bottom UI stack, so
 * clearing the bottom is not enough. The box is CENTRED, so it reaches the rail
 * symmetrically and clears only while its full width stays under
 * frameWidth - 2*rail — 580px of a 1080px frame. That is the constraint the
 * short vertical line cap exists to satisfy.
 */
export const usableWidth = (frameWidth, orientation) => {
  const s = safeAreaFor(orientation);
  return frameWidth - 2 * Math.max(s.side, s.rightRail);
};

/**
 * The one size for a whole set: the largest step at which EVERY line fits.
 *
 * Deliberately set-wide. A size that changes card to card reads as a glitch,
 * since nothing tells the viewer it carries no meaning — so the fit is a
 * property of the set, decided by its worst line. Taking all the texts at once
 * also means there is no per-card entry point a caller could apply line by
 * line by accident.
 *
 * Returns the smallest step when even that overflows; the caller is expected to
 * shorten its lines and re-fit.
 */
export const fitFontSize = (texts, maxWidthPx) => {
  const descending = [...CAP.fontSizes].sort((a, b) => b - a);
  return (
    descending.find((size) => texts.every((t) => boxWidth(t, size) <= maxWidthPx)) ??
    descending[descending.length - 1]
  );
};

/**
 * Caption type as a fraction of frame width, from the landscape default (58px
 * on a 1620px frame). Holding the RATIO rather than the px is what makes a
 * vertical render look right: the same 58px on a 1080-wide frame is
 * proportionally half again as large, so carrying the number straight over
 * gives short-form captions that shout.
 */
const SIZE_RATIO = 58 / 1620;

const targetSize = (frameWidth) =>
  [...CAP.fontSizes].sort(
    (a, b) => Math.abs(a - SIZE_RATIO * frameWidth) - Math.abs(b - SIZE_RATIO * frameWidth),
  )[0];

/**
 * Characters per line, derived from the average character width of THIS
 * transcript at the chosen size. A fixed number cannot work across frames — the
 * 42 that fits a 1620px landscape frame overflows a 1080px vertical one even at
 * the smallest size in the range. Backed off 5% because the average understates
 * a line of unusually wide letters; the caller re-chunks shorter if a measured
 * line still overflows.
 */
const maxCharsFor = (sampleText, sizePx, usable) => {
  const upper = sampleText.toUpperCase();
  const avgChar = measureText(upper, sizePx) / upper.length;
  return Math.max(8, Math.floor(((usable - 2 * CAP.paddingXEm * sizePx) / avgChar) * 0.95));
};

/**
 * What this frame wants before any lines exist: a starting type size and a
 * character budget. An explicit `caption.maxChars` for the orientation wins —
 * vertical is capped at 12 for PACE, not because 12 is all that fits (deriving
 * from width gives 24, a longer and slower line).
 */
export function planCaptions(frameWidth, orientation, transcriptText) {
  const size = targetSize(frameWidth);
  const capped = CAP.maxChars?.[orientation];
  return {
    fontSizePx: size,
    maxChars: capped ?? maxCharsFor(transcriptText, size, usableWidth(frameWidth, orientation)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [transcriptPath, frameWidth, orientation = "landscape"] = process.argv.slice(2);
  if (!transcriptPath || !frameWidth) {
    console.error("usage: caption-fit.mjs <transcript.json> <frameWidth> [orientation]");
    process.exit(1);
  }
  const text = JSON.parse(fs.readFileSync(transcriptPath, "utf8")).text.trim();
  const plan = planCaptions(Number(frameWidth), orientation, text);
  console.log(
    `${orientation} ${frameWidth}px frame -> ${plan.fontSizePx}px type, ${plan.maxChars} chars/line ` +
      `(${usableWidth(Number(frameWidth), orientation)}px usable)`,
  );
}
