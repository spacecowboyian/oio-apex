/**
 * Sizes and optically centres the hero total.
 *
 * Two things here are not obvious:
 *
 * 1. The figure is sized from its real INK height, not its line box. A script
 *    face carries tall ascenders and deep descenders, so centring the text box
 *    sits the visible number low in the cell. Measuring `actualBoundingBox` and
 *    offsetting by the difference puts the ink's own centre on the cell's
 *    centre — the same optical-centring method HANDOFF records for the brand
 *    circle's glyphs, which were measured once from the real Helvetica ink box.
 *
 * 2. The `$` is included in the measurement even though it is drawn in a
 *    separate span. It is the tallest and deepest glyph in a price, so
 *    measuring the digits alone lets it hang out past the box unaccounted for.
 */

export type FigureFit = {
  fontSize: number;
  /** px to shift the figure down so its ink centres on the cell */
  offsetY: number;
  /** ink height at the chosen size — the caller can report the overhang */
  inkHeight: number;
};

const PROBE = 160;
/** the figure stands this much taller than the cell it is written into */
const INK_TO_CELL = 1.5;
/** how much wider than the cell it may run before width takes over */
const WIDTH_TO_CELL = 1.08;
/** cents are set at this fraction of the dollars */
export const CENTS_SCALE = 0.55;
/** and pulled back in by this much of their OWN size */
export const CENTS_PULL = 0.1;
/** tracking on the whole figure */
export const FIGURE_TRACKING = -0.025;
/** keep this clear of whatever sits above and below the cell */
const CLEARANCE_MARGIN = 8;

const ctx = (): CanvasRenderingContext2D | null => {
  if (typeof document === "undefined") return null;
  return document.createElement("canvas").getContext("2d");
};

/**
 * Composite width at a given size — canvas can measure neither mixed font sizes
 * nor CSS letter-spacing, so the pieces are measured separately and the
 * tracking and the cents' pull are added back arithmetically. Every term scales
 * linearly with the font size, so measuring once at the probe and scaling is
 * exact rather than approximate.
 */
const compositeWidth = (
  c: CanvasRenderingContext2D,
  family: string,
  size: number,
  head: string,
  cents: string,
): number => {
  c.font = `${size}px ${family}`;
  const headW = c.measureText(head).width;
  const centsSize = size * CENTS_SCALE;
  c.font = `${centsSize}px ${family}`;
  const centsW = c.measureText(cents).width;
  const tracking = FIGURE_TRACKING * size * head.length + FIGURE_TRACKING * centsSize * cents.length;
  const pull = -CENTS_PULL * centsSize;
  return headW + centsW + tracking + pull;
};

export const fitFigure = (args: {
  /** currency mark + dollars, i.e. everything at full size */
  head: string;
  /** the cents, including the decimal point */
  cents: string;
  family: string;
  cellWidth: number;
  cellHeight: number;
  /** space above and below the cell the figure may overhang into */
  clearance: number;
  /** the sheet's width, so the figure can never run off the paper */
  paperWidth: number;
}): FigureFit => {
  const { head, cents, family, cellWidth, cellHeight, clearance, paperWidth } = args;
  const c = ctx();
  // No canvas (a non-browser environment): fall back to a size derived from the
  // cell alone. Never throws — a mis-sized total beats a failed render.
  if (!c) return { fontSize: cellHeight * 1.2, offsetY: 0, inkHeight: cellHeight * 1.2 };

  c.font = `${PROBE}px ${family}`;
  const pm = c.measureText(head);
  const probeInk = (pm.actualBoundingBoxAscent || PROBE * 0.72) + (pm.actualBoundingBoxDescent || PROBE * 0.2);
  const probeWidth = compositeWidth(c, family, PROBE, head, cents);

  const targetInk = Math.min(cellHeight * INK_TO_CELL, cellHeight + 2 * (clearance - CLEARANCE_MARGIN));
  const targetWidth = Math.min(cellWidth * WIDTH_TO_CELL, paperWidth - 32);
  const byInk = PROBE * (targetInk / probeInk);
  const byWidth = probeWidth > 0 ? PROBE * (targetWidth / probeWidth) : byInk;
  const fontSize = Math.max(12, Math.min(byInk, byWidth));

  c.font = `${fontSize}px ${family}`;
  const m = c.measureText(head);
  const fbA = m.fontBoundingBoxAscent || fontSize * 0.8;
  const fbD = m.fontBoundingBoxDescent || fontSize * 0.2;
  const inkA = m.actualBoundingBoxAscent || fontSize * 0.72;
  const inkD = m.actualBoundingBoxDescent || fontSize * 0.2;
  // with line-height 1 the content box is `fontSize` tall; where the baseline
  // falls inside it comes from the face's own ascent/descent split
  const baselineFromTop = (fontSize - (fbA + fbD)) / 2 + fbA;
  const inkCentreFromTop = baselineFromTop - (inkA - inkD) / 2;

  return { fontSize, offsetY: fontSize / 2 - inkCentreFromTop, inkHeight: inkA + inkD };
};
