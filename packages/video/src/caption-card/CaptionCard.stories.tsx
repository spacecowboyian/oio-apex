import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import { CaptionCard, computeCaptionDuration } from "./CaptionCard";
import { CaptionCardProps } from "./types";
import { RenderQueuePanel, RenderJob } from "../dev-tools/RenderQueuePanel";
import { color, fontStack, type } from "../theme";

const meta: Meta<typeof CaptionCard> = {
  title: "Video/Caption Card",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof CaptionCard>;

/** No real-footage plate here, so preview over a mid-tone gradient — the
 * translucent black box (rgba(0,0,0,0.72)) reads clearly against it, the way
 * it would over real footage (where captions land over varied backdrops). */
const FootageWindow: React.FC<{ width?: number; height?: number; children: React.ReactNode }> = ({
  width = 640,
  height = 360,
  children,
}) => (
  <div
    style={{
      width,
      height,
      background: "linear-gradient(180deg, #6b7280 0%, #3b4048 100%)",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const StaticFrame: React.FC<{ args: CaptionCardProps; width?: number; height?: number }> = ({ args, width, height }) => (
  <FootageWindow width={width} height={height}>
    <Player
      component={CaptionCard}
      inputProps={args}
      fps={30}
      durationInFrames={computeCaptionDuration(args.holdSeconds)}
      initialFrame={Math.floor(computeCaptionDuration(args.holdSeconds) / 2)}
      compositionWidth={1920}
      compositionHeight={1080}
      style={{ width: "100%", height: "100%" }}
      controls={false}
      clickToPlay={false}
    />
  </FootageWindow>
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

const render = (args: CaptionCardProps) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <div>
      <div style={captionStyle}>Static — held (mid-clip)</div>
      <StaticFrame args={args} />
    </div>
    <div>
      <div style={captionStyle}>Animated — hard cut in and out, no fade</div>
      <FootageWindow>
        <Player
          component={CaptionCard}
          inputProps={args}
          fps={30}
          durationInFrames={computeCaptionDuration(args.holdSeconds)}
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

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * Playground — type a caption line and preview it. The component uppercases
 * whatever you type; keep it short enough to sit on a single line (the card
 * hugs the text and does not wrap).
 */
export const Playground: StoryObj<CaptionCardProps> = {
  args: { text: "Yeah and then I ran right into that cow.", holdSeconds: 2.5 },
  argTypes: {
    text: { control: "text", description: "Caption line — one line, uppercased on render" },
    holdSeconds: { control: { type: "number", min: 0.5, step: 0.5 }, description: "Seconds the card is on screen" },
  },
  render: (args) => {
    const slug = slugify(args.text) || "caption";
    const job: RenderJob = { id: "single", label: args.text, filename: slug, props: args };
    return (
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        <RenderQueuePanel title="Export caption" jobs={[job]} compositionId="CaptionCard" entry="src/index.ts" />
        {render(args)}
      </div>
    );
  },
};

/** The locked design from the backlog sketch. */
export const Main: Story = {
  args: { text: "Yeah and then I ran right into that cow.", holdSeconds: 2.5 },
  render,
};
