import { PartsListConfig, Orientation } from "./types";

/**
 * Every fixed dimension of the receipt, per orientation, in output pixels.
 *
 * These are explicit heights rather than line-height-derived ones on purpose:
 * `computeLayout` has to be a PURE function so `calculateMetadata` in Root.tsx
 * can size a composition without a DOM to measure. Anything that depends on
 * how a font happens to lay out would make the sheet's height a render-time
 * discovery instead of a known quantity.
 */
type Metrics = {
  /** row height — fixed, never compressed. A part name is either readable at
   * frame scale or it isn't, so a long list scrolls instead of shrinking. */
  rowH: number;
  /** the sheet's own box within the frame */
  left: number;
  top: number;
  width: number;
  padTop: number;
  padSide: number;
  padBottom: number;
  /** usable height the sheet may occupy, measured from `top` */
  capacity: number;
  /** hard cap on visible rows, below whatever `capacity` would allow */
  maxRows: number;
  /** chrome pieces */
  colHeadH: number;
  dashBlockH: number;
  totLabelH: number;
  totLabelGap: number;
  cellH: number;
  cellMargin: number;
  budgetRowH: number;
  barGap: number;
  barH: number;
  /** type scale */
  nameSize: number;
  priceSize: number;
  vendorSize: number;
  indexSize: number;
  indexWidth: number;
  colHeadSize: number;
  totLabelSize: number;
  ofSize: number;
  budgetLabelSize: number;
  budgetValueSize: number;
};

/**
 * Landscape hangs the sheet off the frame's TOP edge (Ian 2026-07-26) — the
 * straight top edge is where it's attached, and the tear is at the tail. Its
 * `capacity` of 952 against a 1080 frame leaves at least 128px clear below a
 * full sheet.
 *
 * Portrait sits in the upper band: y=200 clears the platform's top icon row and
 * `capacity` stops at the 1420 line, above the ~500px bottom UI stack (see
 * tokens' `caption.safeArea.vertical`). Its 5-row cap is deliberate and below
 * what the frame could fit — a vertical cut needs the lower half free for
 * whatever else is running there.
 */
export const METRICS: Record<Orientation, Metrics> = {
  landscape: {
    rowH: 58,
    left: 72,
    top: 0,
    width: 900,
    padTop: 40,
    padSide: 54,
    padBottom: 36,
    capacity: 952,
    maxRows: Number.POSITIVE_INFINITY,
    colHeadH: 20,
    dashBlockH: 16,
    totLabelH: 28,
    totLabelGap: 30,
    cellH: 120,
    cellMargin: 36,
    budgetRowH: 34,
    barGap: 24,
    barH: 22,
    nameSize: 24,
    priceSize: 25,
    vendorSize: 12,
    indexSize: 14,
    indexWidth: 36,
    colHeadSize: 12,
    totLabelSize: 20,
    ofSize: 15,
    budgetLabelSize: 26,
    budgetValueSize: 29,
  },
  portrait: {
    rowH: 68,
    left: 40,
    top: 200,
    width: 1000,
    padTop: 44,
    padSide: 44,
    padBottom: 40,
    capacity: 1220,
    maxRows: 5,
    colHeadH: 24,
    dashBlockH: 16,
    totLabelH: 28,
    totLabelGap: 30,
    cellH: 132,
    cellMargin: 40,
    budgetRowH: 40,
    barGap: 24,
    barH: 26,
    nameSize: 29,
    priceSize: 30,
    vendorSize: 14,
    indexSize: 16,
    indexWidth: 42,
    colHeadSize: 14,
    totLabelSize: 20,
    ofSize: 15,
    budgetLabelSize: 30,
    budgetValueSize: 33,
  },
};

/** how deep the torn bottom edge bites into the sheet */
export const TEAR_DEPTH = 18;
/** teeth across the tear — more on the wider portrait sheet so tooth width stays similar */
export const tearTeeth = (orientation: Orientation): number => (orientation === "portrait" ? 36 : 30);

export type PartsLayout = {
  orientation: Orientation;
  metrics: Metrics;
  /** everything on the sheet that isn't list rows */
  chrome: number;
  /** rows the frame could fit, before `maxRows` */
  frameCapacityRows: number;
  /** rows actually shown */
  visibleRows: number;
  /** the sheet's rendered height — constant across every appearance, so the
   * graphic never resizes between visits */
  sheetHeight: number;
  /** how many rows the window can travel: 0 means the list always fits */
  scrollRange: number;
  /** true when the list is longer than the window */
  scrolls: boolean;
};

const budgetBlockHeight = (m: Metrics, hasBudget: boolean): number =>
  hasBudget ? m.budgetRowH * 2 + m.barGap + m.barH : 0;

/**
 * Sheet geometry. Length comes from the item count up to the window's capacity,
 * so a short list makes a short receipt and a long one fills the window and
 * scrolls — but it is computed from the FULL item count, not from how many are
 * printed yet, so every appearance renders the same size sheet.
 */
export const computeLayout = (config: PartsListConfig): PartsLayout => {
  const orientation: Orientation = config.orientation ?? "landscape";
  const base = METRICS[orientation];
  const m: Metrics = { ...base, maxRows: config.maxRows ?? base.maxRows };
  const hasBudget = config.budget !== null && config.budget !== undefined;

  const chrome =
    m.padTop +
    m.padBottom +
    m.colHeadH +
    m.dashBlockH * 2 +
    m.totLabelGap +
    m.totLabelH +
    m.cellH +
    m.cellMargin * 2 +
    budgetBlockHeight(m, hasBudget);

  const frameCapacityRows = Math.max(1, Math.floor((m.capacity - chrome) / m.rowH));
  const visibleRows = Math.max(1, Math.min(config.items.length, frameCapacityRows, m.maxRows));
  const sheetHeight = chrome + visibleRows * m.rowH;
  const scrollRange = Math.max(0, config.items.length - visibleRows);

  return {
    orientation,
    metrics: m,
    chrome,
    frameCapacityRows,
    visibleRows,
    sheetHeight,
    scrollRange,
    scrolls: scrollRange > 0,
  };
};

/* ------------------------------------------------------------------ *
 * Timing. Each appearance is its own clip, so these are per-clip.
 * ------------------------------------------------------------------ */

/** holds on the previous state, at the top of the list — "here's where we're at" */
export const OPEN_HOLD_SECONDS = 1.2;
/** travelling down to where the new lines go */
export const TRAVEL_SECONDS = 0.9;
/** how long an arriving line stays enlarged before settling */
export const EMPHASIS_SECONDS = 1.5;
/** the settle itself */
export const SETTLE_SECONDS = 0.42;
/** reading time on the new state before the clip ends */
export const RESULT_HOLD_SECONDS = 1.6;
/** the total's count-up */
export const COUNT_SECONDS = 0.62;
/** the closing recap's travel — slower, it is re-reading the whole build */
export const RECAP_TRAVEL_SECONDS = 3.2;
export const RECAP_END_HOLD_SECONDS = 1.8;
/** a few frames of tail so the last frame isn't the exact end of a spring */
const END_BUFFER_FRAMES = 12;

/** Where each appearance's beats fall, in frames. */
export type AppearanceTiming = {
  openHold: number;
  travel: number;
  emphasis: number;
  settle: number;
  resultHold: number;
  /** frame the new lines land and the count-up starts */
  revealAt: number;
  /** frame the whole clip ends */
  total: number;
};

export const appearanceTiming = (
  fps: number,
  travels: boolean,
  emphasisSeconds: number = EMPHASIS_SECONDS,
): AppearanceTiming => {
  const openHold = Math.round(OPEN_HOLD_SECONDS * fps);
  const travel = travels ? Math.round(TRAVEL_SECONDS * fps) : 0;
  const emphasis = Math.round(emphasisSeconds * fps);
  const settle = Math.round(SETTLE_SECONDS * fps);
  const resultHold = Math.round(RESULT_HOLD_SECONDS * fps);
  const revealAt = openHold + travel;
  return {
    openHold,
    travel,
    emphasis,
    settle,
    resultHold,
    revealAt,
    total: revealAt + emphasis + settle + resultHold + END_BUFFER_FRAMES,
  };
};

export const recapTiming = (fps: number) => {
  const openHold = Math.round(OPEN_HOLD_SECONDS * fps);
  const travel = Math.round(RECAP_TRAVEL_SECONDS * fps);
  const endHold = Math.round(RECAP_END_HOLD_SECONDS * fps);
  return { openHold, travel, endHold, total: openHold + travel + endHold + END_BUFFER_FRAMES };
};

/** Parts printed before, and added by, appearance `idx`. */
export const segmentRange = (segments: number[], idx: number): { start: number; end: number } => {
  const start = segments.slice(0, idx).reduce((a, b) => a + b, 0);
  return { start, end: start + (segments[idx] ?? 0) };
};

/** Row index the window must sit at so every newly-added line is visible. */
export const windowTopFor = (endCount: number, visibleRows: number, itemCount: number): number =>
  Math.max(0, Math.min(endCount, itemCount) - visibleRows);

/**
 * Duration for whichever appearance the config selects. Mirrors exactly what
 * the component renders — including whether this appearance travels at all,
 * since a segment that fits the window skips the scroll beat and is shorter.
 */
export const computeDuration = (config: PartsListConfig, fps = 30): number => {
  const layout = computeLayout(config);
  if (config.appearance === "recap") return recapTiming(fps).total;
  const idx = typeof config.appearance === "number" ? config.appearance : 0;
  const { end } = segmentRange(config.segments, idx);
  const travels = windowTopFor(end, layout.visibleRows, config.items.length) > 0;
  return appearanceTiming(fps, travels, config.emphasisSeconds ?? EMPHASIS_SECONDS).total;
};

/** Every appearance's duration, for a caller stitching or batch-exporting them. */
export const allDurations = (config: PartsListConfig, fps = 30): number[] => [
  ...config.segments.map((_, i) => computeDuration({ ...config, appearance: i }, fps)),
  computeDuration({ ...config, appearance: "recap" }, fps),
];
