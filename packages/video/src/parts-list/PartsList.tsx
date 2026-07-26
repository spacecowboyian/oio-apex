import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { PartsListConfig, PartLine, Orientation } from "./types";
import {
  appearanceTiming,
  computeDuration,
  computeLayout,
  recapTiming,
  segmentRange,
  windowTopFor,
  EMPHASIS_SECONDS,
  COUNT_SECONDS,
} from "./layout";
import { Receipt, ReceiptState, ramp, easeOutCubic } from "./Receipt";
import { sumTo } from "./money";
import "../foundations/fonts";
import "./scriptFont";

/**
 * Derives what the sheet shows on this frame. All of the choreography lives
 * here so `Receipt` stays a pure "draw this state" component — which is what
 * makes a still at any frame reproducible.
 *
 * One appearance: opens at the top of the list on the PREVIOUS total, holds
 * ("here's where we're at"), travels down to where the new lines go, lands
 * them enlarged while the total counts up, then holds on the result. A segment
 * whose lines already fit the window skips the travel beat entirely — and is
 * correspondingly shorter, which `computeDuration` accounts for.
 */
const stateForFrame = (config: PartsListConfig, frame: number, fps: number): ReceiptState => {
  const layout = computeLayout(config);
  const items = config.items;
  const countFrames = Math.round(COUNT_SECONDS * fps);

  if (config.appearance === "recap") {
    const t = recapTiming(fps);
    const travelEnd = t.openHold + t.travel;
    return {
      printed: items.length,
      batchStart: -1,
      batchEnd: -1,
      windowTop: ramp(frame, t.openHold, travelEnd, 0, layout.scrollRange),
      // Every line is already on the sheet, but the figure tallies from zero
      // while the list travels — a cash-register count of the whole build
      // rather than a static final frame.
      total: ramp(frame, t.openHold, travelEnd, 0, sumTo(items, items.length), easeOutCubic),
      emphasis: 0,
    };
  }

  const idx = typeof config.appearance === "number" ? config.appearance : 0;
  const { start, end } = segmentRange(config.segments, idx);
  const target = windowTopFor(end, layout.visibleRows, items.length);
  const t = appearanceTiming(fps, target > 0, config.emphasisSeconds ?? EMPHASIS_SECONDS);
  const revealed = frame >= t.revealAt;
  const settleFrom = t.revealAt + t.emphasis;

  return {
    printed: revealed ? end : start,
    batchStart: start,
    batchEnd: end,
    windowTop: ramp(frame, t.openHold, t.openHold + t.travel, 0, target),
    total: ramp(frame, t.revealAt, t.revealAt + countFrames, sumTo(items, start), sumTo(items, end), easeOutCubic),
    // full size on arrival, held, then settles into the column
    emphasis: revealed ? ramp(frame, settleFrom, settleFrom + t.settle, 1, 0, easeOutCubic) : 0,
  };
};

export const PartsList: React.FC<{ config: PartsListConfig }> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const layout = computeLayout(config);
  const state = stateForFrame(config, frame, fps);

  // off by default: these are cut between in the edit, so a built-in exit
  // mostly gets in the way
  const outFrames = 10;
  const opacity = config.animateOut
    ? ramp(frame, durationInFrames - outFrames, durationInFrames - 1, 1, 0, easeOutCubic)
    : 1;

  return (
    <AbsoluteFill style={{ opacity }}>
      <Receipt config={config} layout={layout} state={state} />
    </AbsoluteFill>
  );
};

/**
 * Every `PartsListConfig` field is also accepted directly at the top level, for
 * individually-controllable Storybook args and `--props` overrides. Pass
 * `config` to set them all at once — when present it wins outright, same
 * contract as `LeaderboardProps`.
 */
export type PartsListProps = {
  config?: PartsListConfig;
  title?: string | null;
  items?: PartLine[];
  segments?: number[];
  budget?: number | null;
  appearance?: number | "recap" | null;
  orientation?: Orientation | null;
  frameWidth?: number | null;
  frameHeight?: number | null;
  maxRows?: number | null;
  emphasisSeconds?: number | null;
  animateOut?: boolean | null;
};

export const resolveConfig = (props: PartsListProps): PartsListConfig => {
  if (props.config) return props.config;
  return {
    title: props.title ?? null,
    items: props.items ?? [],
    segments: props.segments ?? [props.items?.length ?? 0],
    budget: props.budget ?? null,
    appearance: props.appearance ?? 0,
    orientation: props.orientation ?? "landscape",
    frameWidth: props.frameWidth ?? null,
    frameHeight: props.frameHeight ?? null,
    maxRows: props.maxRows ?? null,
    emphasisSeconds: props.emphasisSeconds ?? null,
    animateOut: props.animateOut ?? null,
  };
};

export const PartsListComposition: React.FC<PartsListProps> = (props) => <PartsList config={resolveConfig(props)} />;

export { computeDuration, computeLayout };
