import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import { RunHud, computeRunHudDuration } from "./RunHud";
import { RunHudProps } from "./types";
import { color, fontStack, type } from "../theme";

const meta: Meta<typeof RunHud> = {
  title: "Video/Run HUD",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof RunHud>;

/** The HUD is a transparent overlay meant to sit over run footage. No plate
 * here, so preview over a neutral mid-tone (the row carries its own opaque
 * background; this just stands in for the footage the cones sit over). */
const FootageWindow: React.FC<{ width?: number; height?: number; children: React.ReactNode }> = ({
  width = 720,
  height = 405,
  children,
}) => (
  <div
    style={{
      width,
      height,
      background: "linear-gradient(160deg, #4b5563 0%, #1f2937 100%)",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const captionStyle: React.CSSProperties = {
  fontFamily: fontStack("helvetica"),
  fontSize: type.scale.caption,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: color.base.muted,
  marginBottom: 6,
};

const render = (args: RunHudProps) => {
  const duration = computeRunHudDuration(args.thisRun, args.holdSeconds);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={captionStyle}>Static — mid count-up</div>
        <FootageWindow>
          <Player
            component={RunHud}
            inputProps={args}
            fps={30}
            durationInFrames={duration}
            initialFrame={Math.floor(duration * 0.4)}
            compositionWidth={1920}
            compositionHeight={1080}
            style={{ width: "100%", height: "100%" }}
            controls={false}
            clickToPlay={false}
          />
        </FootageWindow>
      </div>
      <div>
        <div style={captionStyle}>Animated — THIS RUN counts up in real time</div>
        <FootageWindow>
          <Player
            component={RunHud}
            inputProps={args}
            fps={30}
            durationInFrames={duration}
            compositionWidth={1920}
            compositionHeight={1080}
            style={{ width: "100%", height: "100%" }}
            controls
            loop
          />
        </FootageWindow>
      </div>
    </div>
  );
};

/** A real featured racer from this session's fixture data — last run 52.281s,
 * currently ~mid-run on their next attempt, with two cone hits. */
export const Main: Story = {
  args: {
    racer: { pos: 1, name: "Hudson Smith", car: "2009 Honda Fit Sport", runs: [56.008, 53.745, 53.342, 52.281] },
    thisRun: 14.702,
    cones: 2,
    event: "autocross",
    holdSeconds: 1,
  },
  render,
};

/** Playground — vary the run time, cone count, and discipline width. */
export const Playground: StoryObj<RunHudProps> = {
  args: {
    racer: { pos: 1, name: "Hudson Smith", car: "2009 Honda Fit Sport", runs: [56.008, 53.745, 53.342, 52.281] },
    thisRun: 14.702,
    cones: 2,
    event: "autocross",
    holdSeconds: 1,
  },
  argTypes: {
    thisRun: { control: { type: "number", min: 1, step: 0.5 }, description: "Final time of the in-progress run (s) — the count-up target" },
    cones: { control: { type: "number", min: 0, max: 8, step: 1 }, description: "Cone hits (icons at the row's right edge)" },
    event: { control: "radio", options: ["track", "autocross", "rallycross"] },
    holdSeconds: { control: { type: "number", min: 0, step: 0.5 }, description: "Hold on the final time after count-up" },
  },
  render,
};
