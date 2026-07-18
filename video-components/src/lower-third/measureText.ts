/**
 * Synchronous text-width measurement via an offscreen canvas — Remotion
 * renders through real Chromium, so `measureText` is always available and
 * gives the same metrics every frame with no async layout/ref dance needed
 * (the codebase otherwise avoids DOM measurement in favor of explicit
 * widths; this is the one place a canvas is the simplest correct source of
 * truth, since knockout-box width must track arbitrary fact/name text).
 */
export const measureTextWidth = (
  text: string,
  fontWeight: number,
  fontFamily: string,
  fontSizePx: number,
): number => {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d");
  if (!ctx) return text.length * fontSizePx * 0.6;
  ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
  return ctx.measureText(text).width;
};
