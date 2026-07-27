import { Easing, interpolate } from "remotion";
import { PartsListConfig } from "./types";
import {
  appearanceLands,
  appearanceTiming,
  computeLayout,
  recapTiming,
  segmentRange,
  windowStops,
  EMPHASIS_SECONDS,
  COUNT_SECONDS,
  PART_BEAT_SECONDS,
} from "./layout";
import { netTo, roundMoney, sumTo } from "./money";

/**
 * The receipt's choreography, kept free of React and of any font side effect on
 * purpose: what the sheet shows on a given frame is pure arithmetic, so it can
 * be simulated frame-by-frame in a plain Node script without a DOM. Sampling a
 * few frames hides ordering bugs — the timing here is verified by walking every
 * frame of every appearance, which is only cheap because this module imports
 * nothing that needs a browser.
 *
 * `Receipt` consumes the `ReceiptState` this produces and knows nothing about
 * appearances or timing.
 */

/** how long a line takes to be crossed off */
export const STRIKE_SECONDS = 0.45;

/** shared easing for the window's travel and the count-up */
export const TRAVEL_EASING = Easing.bezier(0.33, 0.68, 0.3, 1);
export const easeOutCubic = Easing.bezier(0.22, 0.61, 0.36, 1);

/** `interpolate` with both ends clamped — the default extrapolates, which would
 * run the scroll past its target on the hold frames either side. */
export const ramp = (frame: number, from: number, to: number, a: number, b: number, easing = TRAVEL_EASING): number => {
  // A zero-length beat is normal, not an error: an appearance whose new lines
  // already fit the window has no travel to do, so its scroll ramp is
  // [36, 36]. `interpolate` throws on a non-increasing input range, so collapse
  // it to the settled value instead — this is what crashed the first-appearance
  // story before Playwright caught it.
  if (to <= from) return frame < from ? a : b;
  return interpolate(frame, [from, to], [a, b], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
};

/** What the sheet shows on a given frame. Everything the component draws is a
 * pure function of this, which is what makes the render frame-exact. */
export type ReceiptState = {
  /** lines printed so far */
  printed: number;
  /** row index the window sits at, fractional while travelling */
  windowTop: number;
  /** the figure currently on the total */
  total: number;
  /**
   * Per item index: 0 = not struck, 1 = fully struck through. Ramps as the line
   * is crossed off, so the stroke can be drawn on rather than appearing.
   */
  struck: number[];
  /**
   * Per item index: 0 = not on the sheet yet, 1 = fully arrived, in between
   * while a line is landing. One entry per item rather than one value for a
   * batch, because lines arrive one at a time and each runs its own entrance.
   *
   * This replaced a scale-up "emphasis" when the type came up to phone-readable
   * sizes (Ian 2026-07-27): the longest real row then left 12px of slack in
   * portrait, so ANY enlargement drove the part name through the amount. The
   * entrance is deliberately vertical-and-opacity only — nothing here may
   * change a row's WIDTH. The one-at-a-time cadence is what marks the new line
   * now; the animation is just the landing.
   */
  arrival: number[];
};

/**
 * Derives what the sheet shows on this frame.
 *
 * One appearance: opens at the top of the list on the PREVIOUS total, holds
 * ("here's where we're at"), travels down to where the first new line goes,
 * then lands the new lines ONE AT A TIME, `beat` apart — each arriving
 * enlarged while the total steps up by that part's price, then settling. Ian
 * speaks over the clip, so the beat is what gives him room to say what each
 * part is before the next lands; it is never a batch drop.
 *
 * An appearance whose first line is already inside the window skips the travel
 * beat entirely and is correspondingly shorter, which `computeDuration`
 * accounts for.
 */
export const stateForFrame = (config: PartsListConfig, frame: number, fps: number): ReceiptState => {
  const layout = computeLayout(config);
  const items = config.items;
  const countFrames = Math.round(COUNT_SECONDS * fps);

  if (config.appearance === "recap") {
    const t = recapTiming(fps);
    const travelEnd = t.openHold + t.travel;
    return {
      printed: items.length,
      windowTop: ramp(frame, t.openHold, travelEnd, 0, layout.scrollRange),
      // Every line is already on the sheet, but the figure tallies from zero
      // while the list travels — a cash-register count of the whole build
      // rather than a static final frame.
      total: ramp(frame, t.openHold, travelEnd, 0, netTo(items, items.length), easeOutCubic),
      // the recap opens on a finished sheet — nothing is landing, and anything
      // struck during the build is already struck
      arrival: items.map(() => 1),
      struck: items.map((i) => (i.voidedAt != null ? 1 : 0)),
    };
  }

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

  // How many of this batch's lines are on the sheet. `landed - 1` is the most
  // recent arrival — the one being spoken to. Counted against the actual land
  // frames rather than divided out of the beat, because cued arrivals are not
  // evenly spaced.
  const lands = appearanceLands(config, idx, fps, t);
  const landed = lands.filter((f) => frame >= f).length;
  const last = landed - 1;

  // Each line runs its own entrance, so one that landed three beats ago is long
  // since settled while the newest is still dropping in.
  const arrival = items.map((_, i) => {
    if (i < start) return 1; // printed on an earlier appearance
    const k = i - start;
    if (k >= t.parts || k > last) return 0; // not landed yet
    const land = lands[k];
    return ramp(frame, land, land + t.settle, 0, 1, easeOutCubic);
  });

  // The window steps down to arrive exactly as the next line does; before the
  // first it is the opening travel from the top of the list.
  const windowTop =
    landed === 0
      ? ramp(frame, Math.max(0, lands[0] - t.travel - t.openHold), Math.max(1, lands[0] - t.travel), 0, stops[0])
      : landed >= t.parts
        ? stops[t.parts - 1]
        : ramp(frame, lands[landed] - t.scroll, lands[landed], stops[landed - 1], stops[landed]);

  const strikeFrames = Math.round(STRIKE_SECONDS * fps);
  const struck = items.map((it) => {
    if (it.voidedAt == null) return 0;
    const at = Math.round(it.voidedAt * fps);
    return ramp(frame, at, at + strikeFrames, 0, 1, easeOutCubic);
  });

  // Every change to the figure — a line landing, a line being struck off — is
  // one event on a single ordered timeline, so the count runs through the same
  // path whichever direction it moves. Doing it as "sum of what has landed"
  // minus "sum of what is struck" cannot animate: two changes close together
  // would fight over the same ramp.
  const events: { frame: number; delta: number }[] = [];
  lands.forEach((f, k) => {
    const it = items[start + k];
    if (it) events.push({ frame: f, delta: roundMoney(it.price) });
  });
  items.forEach((it) => {
    if (it.voidedAt != null) events.push({ frame: Math.round(it.voidedAt * fps), delta: -roundMoney(it.price) });
  });
  events.sort((a, b) => a.frame - b.frame);

  let before = sumTo(items, start);
  let after = before;
  let eventFrame = -1;
  for (const e of events) {
    if (e.frame > frame) break;
    before = after;
    after += e.delta;
    eventFrame = e.frame;
  }

  return {
    printed: start + landed,
    windowTop,
    total: eventFrame < 0 ? after : ramp(frame, eventFrame, eventFrame + countFrames, before, after, easeOutCubic),
    arrival,
    struck,
  };
};
