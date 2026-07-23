import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import { TravelMap, computeTravelMapDuration } from "./TravelMap";
import { TravelMapProps } from "./types";
import { color, fontStack, type } from "../theme";

const meta: Meta<typeof TravelMap> = {
  title: "Video/Travel Map",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof TravelMap>;

/** The travel map is a transparent overlay meant to composite over driving
 * footage (or an illustrated map base — Ian's call). No plate here, so preview
 * over a muted map-ish gradient stand-in. */
const FootageWindow: React.FC<{ width?: number; height?: number; children: React.ReactNode }> = ({
  width = 720,
  height = 405,
  children,
}) => (
  <div
    style={{
      width,
      height,
      background: "linear-gradient(155deg, #3a4a3f 0%, #22302b 55%, #1a2320 100%)",
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

const render = (args: TravelMapProps) => {
  const duration = computeTravelMapDuration(args.holdSeconds, args.drawSeconds);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={captionStyle}>Static — mid-draw</div>
        <FootageWindow>
          <Player
            component={TravelMap}
            inputProps={args}
            fps={30}
            durationInFrames={duration}
            initialFrame={Math.floor(duration * 0.55)}
            compositionWidth={1920}
            compositionHeight={1080}
            style={{ width: "100%", height: "100%" }}
            controls={false}
            clickToPlay={false}
          />
        </FootageWindow>
      </div>
      <div>
        <div style={captionStyle}>Animated — line draws, mileage counts</div>
        <FootageWindow>
          <Player
            component={TravelMap}
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

/** The real Lake Garnett pilgrimage — KC → Lake Garnett, ~77 driving miles. */
export const Main: Story = {
  args: { fromLabel: "KC", toLabel: "LAKE GARNETT", miles: 77, drawSeconds: 3.5, holdSeconds: 1.5, showMileage: true },
  render,
};

/** The same trip with the counter off — just the two place names and the
 * meter, for when the distance isn't the point. */
export const NoMileage: Story = {
  args: { fromLabel: "KC", toLabel: "LAKE GARNETT", miles: 77, drawSeconds: 3.5, holdSeconds: 1.5, showMileage: false },
  render,
};

/** Playground — vary the endpoints' labels, the mileage, whether the counter
 * shows at all, and how long the meter takes to fill. */
export const Playground: StoryObj<TravelMapProps> = {
  args: { fromLabel: "KC", toLabel: "LAKE GARNETT", miles: 77, drawSeconds: 3.5, holdSeconds: 1.5, showMileage: true },
  argTypes: {
    fromLabel: { control: "text", description: "Origin label" },
    toLabel: { control: "text", description: "Destination label" },
    miles: { control: { type: "number", min: 1, step: 1 }, description: "Total mileage counted up to" },
    showMileage: { control: "boolean", description: "Show the mileage counter riding the meter" },
    drawSeconds: { control: { type: "number", min: 0.5, step: 0.5 }, description: "Seconds for the meter to fill across" },
    holdSeconds: { control: { type: "number", min: 0, step: 0.5 }, description: "Hold on the finished route" },
  },
  render,
};
