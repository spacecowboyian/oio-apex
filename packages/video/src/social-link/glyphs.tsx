import React from "react";
import { fontStack } from "../theme";

/**
 * Brand-mark glyphs for the social-link corner label (spacecowboyian/oio-apex
 * #1), authored in a stable 0–24 coordinate box to be cut out of an
 * `IconKnockoutBox`. All "ink" is solid fill layering (paint a shape, then
 * punch a smaller same-shape in the opposite color on top) rather than thin
 * strokes — strokes read fuzzy/broken in a luminance mask.
 *
 * The Instagram / YouTube / Facebook marks are carefully-drawn approximations
 * at correct proportions. The website "link" glyph is the real Font Awesome
 * Free "link" solid icon, path data verbatim.
 *
 * ATTRIBUTION: Font Awesome Free icons are CC BY 4.0
 * (https://fontawesome.com/license/free). Shipping these in a rendered video
 * needs attribution in the video credits (or a licensed/paid FA tier) — same
 * open licensing item as the Noun Project cone icon. Tracked on issue #1.
 */

const fontFamily = fontStack("helvetica");

/** shrinks a glyph uniformly around the box's own center (12,12) — Instagram
 * and YouTube are drawn near-full-bleed of the 24x24 box, which reads much
 * bigger than a single letterform like Facebook's "f"; scaling around center
 * keeps everything registered to the same visual center. */
const shrink = (scale: number, node: React.ReactNode) => (
  <g transform={`translate(12,12) scale(${scale}) translate(-12,-12)`}>{node}</g>
);

export const InstagramGlyph: React.FC = () =>
  shrink(
    0.62,
    <>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="black" />
      <rect x="5" y="5" width="14" height="14" rx="3" fill="white" />
      <circle cx="12" cy="12" r="5" fill="black" />
      <circle cx="12" cy="12" r="2.6" fill="white" />
      <circle cx="17.3" cy="6.7" r="1" fill="black" />
    </>,
  );

export const YoutubeGlyph: React.FC = () =>
  shrink(
    0.62,
    <>
      <rect x="1.5" y="4.5" width="21" height="15" rx="4" fill="black" />
      <path d="M10 8.5 L16 12 L10 15.5 Z" fill="white" />
    </>,
  );

/**
 * The real Font Awesome Free "link" solid icon, path data verbatim (native
 * viewBox 640×512), scaled/centered into the 0–24 icon space at roughly the
 * same visual weight as the other social glyphs (~13 units wide). CC BY 4.0 —
 * see the attribution note above.
 */
export const LinkGlyph: React.FC = () => (
  <g transform="translate(5.5, 6.8) scale(0.0203125)">
    <path
      fill="black"
      d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"
    />
  </g>
);

/**
 * Facebook's "f" — optically centered via real ink extent (canvas
 * `measureText`'s actualBoundingBox*), not `text-anchor`/`dominant-baseline`,
 * which center the glyph's advance box, not its visible ink; a single
 * asymmetric letterform reads off-center anchored that way. Same technique the
 * project already uses for the circle-system glyphs (HANDOFF.md). Computed at
 * render, not module load, so it never runs before a canvas is available.
 */
export const FacebookGlyph: React.FC = () => {
  const fontSizePx = 17;
  const cx = 12;
  const cy = 12;
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d");
  if (ctx) ctx.font = `700 ${fontSizePx}px ${fontFamily}`;
  const m = ctx?.measureText("f");
  const inkLeft = m?.actualBoundingBoxLeft ?? 0;
  const inkRight = m?.actualBoundingBoxRight ?? fontSizePx * 0.5;
  const inkAscent = m?.actualBoundingBoxAscent ?? fontSizePx * 0.7;
  const inkDescent = m?.actualBoundingBoxDescent ?? 0;
  const x = cx - (inkRight - inkLeft) / 2;
  const y = cy - (inkDescent - inkAscent) / 2;
  return (
    <text x={x} y={y} textAnchor="start" fontFamily={fontFamily} fontWeight={700} fontSize={fontSizePx} fill="black">
      f
    </text>
  );
};

/** the platforms a social-link tag can present. `website` is a plain URL (the
 * FA link glyph); the rest are handle-style platforms. */
export type SocialPlatform = "instagram" | "facebook" | "youtube" | "website";

export const SOCIAL_GLYPHS: Record<SocialPlatform, React.FC> = {
  instagram: InstagramGlyph,
  facebook: FacebookGlyph,
  youtube: YoutubeGlyph,
  website: LinkGlyph,
};
