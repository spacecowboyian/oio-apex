import { type } from "../theme";

/**
 * The hero (broadcast) corner-label glyph size — 3x the standard h5 scale.
 * The previous (h5) size read as illegible at broadcast viewing distance.
 * Presets scale this: the top-corner event/venue tags run 0.6x, the
 * social-link label 0.75x (full size read too heavy, per Ian).
 */
export const HERO_FONT_PX = parseFloat(type.scale.h5) * 16 * 3;

/** the corner-label token padding fractions (0.32em / 0.55em), as px for a
 * given glyph size — shared so every box/word pads identically. */
export const padY = (fontSizePx: number) => 0.32 * fontSizePx;
export const padX = (fontSizePx: number) => 0.55 * fontSizePx;
