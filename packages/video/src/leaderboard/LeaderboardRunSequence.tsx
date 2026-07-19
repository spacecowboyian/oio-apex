import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Leaderboard, LeaderboardProps, resolveConfig } from "./Leaderboard";
import { LeaderboardConfig } from "./types";
import { buildRunSequenceLegs } from "./runSequence";

/**
 * Chains the Leaderboard's existing run-to-run "camera follow" transition
 * across every run of the event, back to back — run 1->2, 2->3, ... ->
 * final — for a fast-paced recap format (e.g. a vertical short narrating a
 * whole event). Each leg is rendered by the unmodified `Leaderboard`
 * component inside its own Remotion `Sequence`; see runSequence.ts for how
 * the legs/durations are built. This file only lays those legs out on the
 * timeline and controls the drawer (`enterAnimation`/`animateOut`) so it
 * reads as ONE board racing through the event, not a board that
 * slides-in-and-out between every run: only the first leg slides in, only
 * the last leg (if `animateOut` isn't explicitly turned off) slides out.
 */
export const LeaderboardRunSequence: React.FC<{ config: LeaderboardConfig; fps?: number }> = ({
  config,
  fps = 30,
}) => {
  const legs = buildRunSequenceLegs(config, fps);
  let cursor = 0;
  return (
    <AbsoluteFill>
      {legs.map((leg, i) => {
        const from = cursor;
        cursor += leg.durationInFrames;
        const isFirst = i === 0;
        const isLast = i === legs.length - 1;
        return (
          <Sequence key={i} from={from} durationInFrames={leg.durationInFrames} layout="none">
            <Leaderboard
              config={
                {
                  ...leg.config,
                  enterAnimation: isFirst ? (leg.config.enterAnimation ?? true) : false,
                  animateOut: isLast ? (leg.config.animateOut ?? true) : false,
                } as LeaderboardConfig
              }
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** What Remotion actually renders — same `config`-or-individual-fields input
 * as `LeaderboardComposition` (see Leaderboard.tsx's `resolveConfig`), just
 * routed through the chained sequence instead of a single board. */
export const LeaderboardRunSequenceComposition: React.FC<LeaderboardProps> = (props) => (
  <LeaderboardRunSequence config={resolveConfig(props)} />
);
