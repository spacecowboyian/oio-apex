/**
 * Shared sizing for the top-corner tags (event date #2, venue #5). Both are
 * the same corner-label grammar as the bottom `LowerThird`, just anchored to a
 * top corner at a smaller size — so they share these two numbers rather than
 * each hardcoding its own.
 */

/** Top-corner tags read at 0.6x the lower-third's hero size — a full two-part
 * tag ("I-35 SPEEDWAY" + "WINSTON, MISSOURI", "JULY.19.26" + "KCRX") carries
 * more text than a short fact/name pair and would bleed past the frame at hero
 * size (matches the design sketch's TAG_FONT_PX). */
export const TAG_FONT_SCALE = 0.6;

/** Inset from the top edge, matching LowerThird's fixed 64px side inset so the
 * tag sits the same distance off all its frame edges — the symmetric 64px
 * corner inset the design sketch uses (EDGE_INSET). LowerThird's top placement
 * defaults this to 0 (flush, for reels where the safe-area inset is passed
 * per-platform); a broadcast top-corner tag wants the full 64px. */
export const TAG_TOP_INSET_PX = 64;
