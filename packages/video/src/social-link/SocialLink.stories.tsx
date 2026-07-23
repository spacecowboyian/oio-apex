import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import { SocialLink, computeSocialLinkDuration, computeSocialLinkHeldFrame } from "./SocialLink";
import { SocialLinkProps } from "./types";
import { RenderQueuePanel, RenderJob } from "../dev-tools/RenderQueuePanel";
import { color, fontStack, type } from "../theme";

const meta: Meta<typeof SocialLink> = {
  title: "Video/Social Link",
  parameters: { layout: "padded" },
  argTypes: {
    platform: { control: "select", options: ["instagram", "facebook", "youtube", "website"] },
    surface: { control: "radio", options: ["dark", "light"] },
  },
};
export default meta;

type Story = StoryObj<typeof SocialLink>;

/** Social links are the house dark surface (white box). No real-footage plate
 * here, so preview over a dark gradient — enough to eyeball the white-box
 * knockout (the icon reads as a hole to the backdrop) and the reveal
 * choreography. */
const DarkWindow: React.FC<{ width?: number; height?: number; children: React.ReactNode }> = ({
  width = 640,
  height = 360,
  children,
}) => (
  <div
    style={{
      width,
      height,
      background: "linear-gradient(160deg, #2a2622 0%, #0d0b0a 100%)",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const StaticFrame: React.FC<{ args: SocialLinkProps; width?: number; height?: number }> = ({ args, width, height }) => (
  <DarkWindow width={width} height={height}>
    <Player
      component={SocialLink}
      inputProps={args}
      fps={30}
      durationInFrames={computeSocialLinkDuration(args.holdSeconds)}
      initialFrame={computeSocialLinkHeldFrame()}
      compositionWidth={1920}
      compositionHeight={1080}
      style={{ width: "100%", height: "100%" }}
      controls={false}
      clickToPlay={false}
    />
  </DarkWindow>
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

const render = (args: SocialLinkProps) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <div>
      <div style={captionStyle}>Static — fully out ({args.platform} · {args.handle})</div>
      <StaticFrame args={args} />
    </div>
    <div>
      <div style={captionStyle}>Animated</div>
      <DarkWindow>
        <Player
          component={SocialLink}
          inputProps={args}
          fps={30}
          durationInFrames={computeSocialLinkDuration(args.holdSeconds)}
          compositionWidth={1920}
          compositionHeight={1080}
          style={{ width: "100%", height: "100%" }}
          controls
          loop
        />
      </DarkWindow>
    </div>
  </div>
);

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Single-item playground — hand-build one social-link tag via the Controls
 * panel (platform / handle / surface / holdSeconds). Every platform renders the
 * same way: [icon box] HANDLE, no separator.
 */
export const Playground: StoryObj<SocialLinkProps> = {
  args: { platform: "instagram", handle: "OIORACING", surface: "dark", holdSeconds: 3 },
  argTypes: {
    handle: { control: "text", description: "Handle or URL (all-caps), written bare — OIORACING, OIORACING.COM. No leading @ or slash." },
    holdSeconds: { control: { type: "number", min: 0.5, step: 0.5 }, description: "Seconds held on screen before exit" },
  },
  render: (args) => {
    const slug = slugify(`${args.platform}-${args.handle}`) || "social-link";
    const job: RenderJob = { id: "single", label: `${args.platform} · ${args.handle}`, filename: slug, props: args };
    return (
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        <RenderQueuePanel title="Export social link" jobs={[job]} compositionId="SocialLink" entry="src/index.ts" />
        {render(args)}
      </div>
    );
  },
};

/** The four locked variants from the backlog sketch — three platform handles
 * and one plain website URL. All render identically: [icon] WORD, no separator. */
export const Instagram: Story = { args: { platform: "instagram", handle: "OIORACING", surface: "dark" }, render };
export const Facebook: Story = { args: { platform: "facebook", handle: "OIORACING", surface: "dark" }, render };
export const Youtube: Story = { args: { platform: "youtube", handle: "OIORACING", surface: "dark" }, render };
export const Website: Story = { args: { platform: "website", handle: "OIORACING.COM", surface: "dark" }, render };
