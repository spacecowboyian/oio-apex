import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { PartsListConfig, PartLine, Orientation } from "./types";
import { computeDuration, computeLayout } from "./layout";
import { stateForFrame, ramp, easeOutCubic } from "./choreography";
import { Receipt } from "./Receipt";
import "../foundations/fonts";
import "./scriptFont";

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
  side?: "left" | "right" | null;
  maxRows?: number | null;
  emphasisSeconds?: number | null;
  partBeatSeconds?: number | null;
  durationSeconds?: number | null;
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
    side: props.side ?? null,
    maxRows: props.maxRows ?? null,
    emphasisSeconds: props.emphasisSeconds ?? null,
    partBeatSeconds: props.partBeatSeconds ?? null,
    durationSeconds: props.durationSeconds ?? null,
    animateOut: props.animateOut ?? null,
  };
};

export const PartsListComposition: React.FC<PartsListProps> = (props) => <PartsList config={resolveConfig(props)} />;

export { computeDuration, computeLayout };
