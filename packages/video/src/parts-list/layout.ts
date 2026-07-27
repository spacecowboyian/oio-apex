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
  /** type scale — see PHONE_FLOOR below; nothing here may sit under it */
  nameSize: number;
  priceSize: number;
  vendorSize: number;
  /**
   * Widest the vendor may draw before it truncates. An explicit px per
   * orientation rather than a shared percentage: portrait sets its vendor 6px
   * larger AND tracks it at 0.12em, so the same ratio that comfortably fits
   * "DNA MOTORING" in landscape clips it in portrait. Sized to clear the
   * longest real vendor with room, while still bounding a pathological one so
   * it can never push the part name out of its own row.
   */
  vendorMaxWidth: number;
  colHeadSize: number;
  totLabelSize: number;
  ofSize: number;
  budgetLabelSize: number;
  budgetValueSize: number;
};

/**
 * The smallest type either sheet is allowed to use, in composition pixels.
 * Ian 2026-07-27: "make the smallest size font readable on a phone."
 *
 * Anchored to a measured precedent rather than picked: the short-form vertical
 * leaderboard landed on 34–36px against a 1080x1920 master, and its ~24px
 * car/model subtitle was DELETED rather than shrunk because it was unreadable
 * at that scale (see the short-form recap settings). The caption tokens agree
 * from the other direction — 58px "still reads on a phone."
 *
 * The two orientations differ because a composition pixel is not the same
 * angular size on the phone. A 1080x1920 master plays full-bleed (~0.36 pt per
 * px on a ~390pt-wide handset); a 1920x1080 master watched fullscreen-landscape
 * gets ~0.44 pt per px. So landscape reaches the same on-glass size with less.
 *
 * A landscape cut dropped into a VERTICAL feed is letterboxed to ~0.20 pt/px
 * and nothing at this scale survives that — cut portrait for those, which is
 * what the portrait preset is for.
 */
export const PHONE_FLOOR: Record<Orientation, number> = { landscape: 28, portrait: 34 };

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
    rowH: 78,
    left: 72,
    top: 0,
    width: 900,
    padTop: 40,
    padSide: 54,
    padBottom: 36,
    capacity: 952,
    maxRows: Number.POSITIVE_INFINITY,
    colHeadH: 34,
    dashBlockH: 16,
    totLabelH: 38,
    totLabelGap: 30,
    cellH: 120,
    cellMargin: 36,
    budgetRowH: 44,
    barGap: 24,
    barH: 22,
    nameSize: 34,
    priceSize: 34,
    vendorSize: 28,
    // Measured the same way: longest real vendor 243, and the longest name
    // (368) plus the widest amount (159) leaves 241 — the two windows do not
    // quite overlap, because no real row pairs the longest name WITH the widest
    // amount. 260 clears every actual row and still bounds a runaway vendor.
    vendorMaxWidth: 260,
    colHeadSize: 28,
    totLabelSize: 34,
    ofSize: 28,
    budgetLabelSize: 34,
    budgetValueSize: 36,
  },
  portrait: {
    rowH: 94,
    left: 40,
    top: 200,
    width: 1000,
    padTop: 44,
    padSide: 44,
    padBottom: 40,
    capacity: 1220,
    maxRows: 5,
    colHeadH: 42,
    dashBlockH: 16,
    totLabelH: 46,
    totLabelGap: 30,
    cellH: 132,
    cellMargin: 40,
    budgetRowH: 54,
    barGap: 24,
    barH: 26,
    // Below landscape's headroom relative to the floor on purpose: the portrait
    // sheet is only 1000px wide and its vendor cannot go under 34, so the name
    // is what gives. At 42 the longest real row ("Bend Kit — 8 piece" / "DNA
    // Motoring" / $94.04) left 12px before the amount and read as one run-on
    // string. Measured, not guessed — re-measure rather than nudge.
    nameSize: 38,
    priceSize: 40,
    vendorSize: 34,
    // Measured: longest real vendor is 295 ("DNA Motoring"), and the longest
    // name (412) plus the widest amount (185) leaves 316 before the row
    // overflows. Anything in [295, 316] satisfies both; 308 sits between them.
    vendorMaxWidth: 308,
    colHeadSize: 34,
    totLabelSize: 40,
    ofSize: 34,
    budgetLabelSize: 40,
    budgetValueSize: 44,
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
  // `right` mirrors the sheet's own left margin to the far edge, so the inset
  // from the frame is identical on either side rather than a second number to
  // keep in sync.
  const frameW = config.frameWidth ?? (orientation === "portrait" ? 1080 : 1920);
  const left = config.side === "right" ? Math.max(0, frameW - base.width - base.left) : base.left;
  const m: Metrics = { ...base, maxRows: config.maxRows ?? base.maxRows, left };
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

/**
 * The sheet with NO window: every line printed, nothing to scroll, sized to
 * whatever the full list needs.
 *
 * `computeLayout` deliberately clamps to what a video frame can hold, because
 * on screen the sheet has to live inside one. This is the other thing the same
 * receipt is — the physical object, printed end to end — which is what you want
 * for a still, a thumbnail, or simply reading the whole ledger at once. It
 * cannot be expressed as a `maxRows` override: that is also clamped by the
 * frame's capacity, which is exactly the limit being lifted here.
 */
export const fullSheetLayout = (config: PartsListConfig): PartsLayout => {
  const base = computeLayout(config);
  const rows = Math.max(1, config.items.length);
  return {
    ...base,
    frameCapacityRows: rows,
    visibleRows: rows,
    sheetHeight: base.chrome + rows * base.metrics.rowH,
    scrollRange: 0,
    scrolls: false,
  };
};

/* ------------------------------------------------------------------ *
 * Timing. Each appearance is its own clip, so these are per-clip.
 * ------------------------------------------------------------------ */

/** holds on the previous state, at the top of the list — "here's where we're at" */
export const OPEN_HOLD_SECONDS = 1.2;
/** travelling down to where the new lines go */
export const TRAVEL_SECONDS = 0.9;
/**
 * Arrival-to-arrival gap within one appearance. Parts land ONE AT A TIME, never
 * as a batch — Ian 2026-07-27 talks over each line as it appears, so the clip
 * has to leave him room to say what a part is and what it cost before the next
 * one lands. Raise it per clip via `partBeatSeconds` when a part needs a longer
 * story; it is the knob that sets the clip's whole length.
 */
export const PART_BEAT_SECONDS = 2.4;
/**
 * Held after the LAST part of an appearance lands, before the closing beat.
 * Was the duration an arriving line stayed enlarged; the enlargement is gone
 * (see `ReceiptState.arrival`) but the pause it bought is still wanted, so the
 * field kept its name and its job of padding the clip's tail.
 */
export const EMPHASIS_SECONDS = 1.5;
/** a line's entrance, and the window's settle */
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
  /** frame the FIRST new line lands and the count-up starts */
  revealAt: number;
  /** frames between one line landing and the next */
  beat: number;
  /** how long the window takes to step down before a line that would land below it */
  scroll: number;
  /** how many lines this appearance adds */
  parts: number;
  /** frame the whole clip ends */
  total: number;
};

/**
 * The frame each line of the batch lands on, in order.
 *
 * A uniform beat by default. An item carrying its own `at` mark lands on that
 * second instead, so a receipt cut to narration follows the words. The two mix
 * freely: an item with no mark falls back to the beat, which is what makes a
 * list usable while it is being dialed in one line at a time against a clip.
 */
export const appearanceLands = (
  config: PartsListConfig,
  idx: number,
  fps: number,
  t: AppearanceTiming,
): number[] => {
  const { start, end } = segmentRange(config.segments, idx);
  const n = Math.max(1, end - start);
  return Array.from({ length: n }, (_, k) => {
    const at = config.items[start + k]?.at;
    return typeof at === "number" ? Math.round(at * fps) : t.revealAt + k * t.beat;
  });
};

export const appearanceTiming = (
  fps: number,
  travels: boolean,
  emphasisSeconds: number = EMPHASIS_SECONDS,
  parts = 1,
  beatSeconds: number = PART_BEAT_SECONDS,
): AppearanceTiming => {
  const openHold = Math.round(OPEN_HOLD_SECONDS * fps);
  const travel = travels ? Math.round(TRAVEL_SECONDS * fps) : 0;
  const emphasis = Math.round(emphasisSeconds * fps);
  const settle = Math.round(SETTLE_SECONDS * fps);
  const resultHold = Math.round(RESULT_HOLD_SECONDS * fps);
  const revealAt = openHold + travel;
  const beat = Math.round(beatSeconds * fps);
  const n = Math.max(1, parts);
  // The window's step has to COMPLETE as the next line lands, or that line
  // arrives below the visible edge. Capped against the beat so a short beat
  // can't ask for a scroll longer than the gap it has to happen in.
  const scroll = Math.min(Math.round(TRAVEL_SECONDS * fps), Math.round(beat * 0.6));
  return {
    openHold,
    travel,
    emphasis,
    settle,
    resultHold,
    revealAt,
    beat,
    scroll,
    parts: n,
    // the LAST line still gets its full emphasis + settle + reading time
    total: revealAt + (n - 1) * beat + emphasis + settle + resultHold + END_BUFFER_FRAMES,
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
 * Where the window sits as each line of the batch lands — one entry per part.
 *
 * Because lines arrive one at a time, the window follows them down instead of
 * jumping once to its final position: stop `k` is wherever it must be for the
 * `k`-th new line to be on screen. This is what lets a segment LONGER than the
 * window still play — the sheet scrolls a row at a time under the arrivals
 * rather than landing lines above the visible edge.
 */
export const windowStops = (config: PartsListConfig, layout: PartsLayout, idx: number): number[] => {
  const { start, end } = segmentRange(config.segments, idx);
  return Array.from({ length: Math.max(1, end - start) }, (_, k) =>
    windowTopFor(start + k + 1, layout.visibleRows, config.items.length),
  );
};

/**
 * Duration for whichever appearance the config selects. Mirrors exactly what
 * the component renders — including whether this appearance travels at all,
 * since a segment that opens where the window already sits skips the scroll
 * beat and is shorter, and including the per-part beat, which dominates.
 */
export const computeDuration = (config: PartsListConfig, fps = 30): number => {
  // Cut to narration: the clip's length is the footage's, not something the
  // choreography gets to decide.
  if (config.durationSeconds != null) return Math.round(config.durationSeconds * fps);
  const layout = computeLayout(config);
  if (config.appearance === "recap") return recapTiming(fps).total;
  const idx = typeof config.appearance === "number" ? config.appearance : 0;
  const { start, end } = segmentRange(config.segments, idx);
  const stops = windowStops(config, layout, idx);
  const t = appearanceTiming(
    fps,
    stops[0] > 0,
    config.emphasisSeconds ?? EMPHASIS_SECONDS,
    end - start,
    config.partBeatSeconds ?? PART_BEAT_SECONDS,
  );
  // With cues the last line can land well after the beat would have put it, so
  // the tail is measured from whichever arrival is actually last.
  const lastLand = Math.max(...appearanceLands(config, idx, fps, t));
  return Math.max(t.total, lastLand + t.emphasis + t.settle + t.resultHold + END_BUFFER_FRAMES);
};

/** Every appearance's duration, for a caller stitching or batch-exporting them. */
export const allDurations = (config: PartsListConfig, fps = 30): number[] => [
  ...config.segments.map((_, i) => computeDuration({ ...config, appearance: i }, fps)),
  computeDuration({ ...config, appearance: "recap" }, fps),
];
