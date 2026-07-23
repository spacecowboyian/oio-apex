import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import { VenueTag } from "./VenueTag";
import { VenueTagProps } from "./types";
import { computeLowerThirdDuration, computeLowerThirdHeldFrame } from "../lower-third/LowerThird";
import { RenderQueuePanel, RenderJob } from "../dev-tools/RenderQueuePanel";
import { color, fontStack, type } from "../theme";

const meta: Meta<typeof VenueTag> = {
  title: "Video/Venue Tag",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof VenueTag>;

/** Like the event date tag, the venue tag is hardcoded to the light (black-box)
 * palette — designed to sit over open sky. No real-footage sky plate yet, so
 * preview over a flat sky-ish gradient (same fallback the event date story
 * uses) — enough to eyeball the black-box-on-light contrast. */
const SkyWindow: React.FC<{ width?: number; height?: number; children: React.ReactNode }> = ({
  width = 640,
  height = 360,
  children,
}) => (
  <div
    style={{
      width,
      height,
      background: "linear-gradient(180deg, #8fb2d4 0%, #cfe0ee 100%)",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

/** frozen on the fully-revealed hold frame, controls off — reuses the real
 * component/Player so it can't drift from what the animation settles into. */
const StaticFrame: React.FC<{ args: VenueTagProps; width?: number; height?: number }> = ({ args, width, height }) => (
  <SkyWindow width={width} height={height}>
    <Player
      component={VenueTag}
      inputProps={args}
      fps={30}
      durationInFrames={computeLowerThirdDuration(args.holdSeconds)}
      initialFrame={computeLowerThirdHeldFrame()}
      compositionWidth={1920}
      compositionHeight={1080}
      style={{ width: "100%", height: "100%" }}
      controls={false}
      clickToPlay={false}
    />
  </SkyWindow>
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

const render = (args: VenueTagProps) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <div>
      <div style={captionStyle}>Static — fully out ({args.venue} · {args.location})</div>
      <StaticFrame args={args} />
    </div>
    <div>
      <div style={captionStyle}>Animated</div>
      <SkyWindow>
        <Player
          component={VenueTag}
          inputProps={args}
          fps={30}
          durationInFrames={computeLowerThirdDuration(args.holdSeconds)}
          compositionWidth={1920}
          compositionHeight={1080}
          style={{ width: "100%", height: "100%" }}
          controls
          loop
        />
      </SkyWindow>
    </div>
  </div>
);

/** filesystem-safe filename from the tag's own fields. */
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Single-item playground — hand-build one venue tag via the Controls panel
 * (venue / location / holdSeconds).
 */
export const Playground: StoryObj<VenueTagProps> = {
  args: { venue: "I-35 SPEEDWAY", location: "WINSTON, MISSOURI", holdSeconds: 3 },
  argTypes: {
    venue: { control: "text", description: "Venue/track name (box) — e.g. I-35 SPEEDWAY" },
    location: { control: "text", description: "City, state (plain word) — e.g. WINSTON, MISSOURI" },
    holdSeconds: { control: { type: "number", min: 0.5, step: 0.5 }, description: "Seconds held on screen before exit" },
  },
  render: (args) => {
    const slug = slugify(`${args.venue}-${args.location}`) || "venue-tag";
    const job: RenderJob = { id: "single", label: `${args.venue} · ${args.location}`, filename: slug, props: args };
    return (
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        <RenderQueuePanel title="Export venue tag" jobs={[job]} compositionId="VenueTag" entry="src/index.ts" />
        {render(args)}
      </div>
    );
  },
};

/** The locked design from the backlog sketch — `I-35 SPEEDWAY` box on the left
 * edge, `WINSTON, MISSOURI` plain word inward, top-left corner, over sky. */
export const Main: Story = {
  args: { venue: "I-35 SPEEDWAY", location: "WINSTON, MISSOURI", holdSeconds: 3 },
  render,
};
