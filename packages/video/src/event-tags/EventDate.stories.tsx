import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import { EventDate } from "./EventDate";
import { EventDateProps } from "./types";
import { formatEventDate } from "./formatEventDate";
import { computeLowerThirdDuration, computeLowerThirdHeldFrame } from "../lower-third/LowerThird";
import { RenderQueuePanel, RenderJob } from "../dev-tools/RenderQueuePanel";
import { color, fontStack, type } from "../theme";

const meta: Meta<typeof EventDate> = {
  title: "Video/Event Date Tag",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof EventDate>;

/** The event tag is hardcoded to the light (black-box) palette — it's designed
 * to sit over open sky. There's no real-footage sky plate yet, so preview it
 * over a flat sky-ish gradient (the same fallback the LowerThird light-surface
 * story uses) — enough to eyeball the black-box-on-light contrast, not a
 * substitute for real footage once available. */
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
 * component/Player so it can't drift from what the animation settles into.
 * Sits beside the animated player to show the end state without scrubbing. */
const StaticFrame: React.FC<{ args: EventDateProps; width?: number; height?: number }> = ({ args, width, height }) => (
  <SkyWindow width={width} height={height}>
    <Player
      component={EventDate}
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

const render = (args: EventDateProps) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <div>
      <div style={captionStyle}>Static — fully out ({formatEventDate(args.dateISO)} · {args.code})</div>
      <StaticFrame args={args} />
    </div>
    <div>
      <div style={captionStyle}>Animated</div>
      <SkyWindow>
        <Player
          component={EventDate}
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

/** filesystem-safe filename from the tag's own fields — same slug approach as
 * the LowerThird playground, keyed on code + date instead of fact/name. */
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Single-item playground — hand-build one event tag via the Controls panel
 * (code / dateISO / holdSeconds). `dateISO` takes an ISO `YYYY-MM-DD` date and
 * the component renders it as `JULY.19.26`; the caption above the static frame
 * echoes the formatted result so the convention is visible at a glance.
 */
export const Playground: StoryObj<EventDateProps> = {
  args: { code: "KCRX", dateISO: "2026-07-19", holdSeconds: 3 },
  argTypes: {
    code: { control: "text", description: "Region + discipline code (box) — e.g. KCRX / KCAX / KSRX, no event number" },
    dateISO: { control: "text", description: "Event date, ISO YYYY-MM-DD — rendered MONTH.DAY.YEAR, 2-digit year" },
    holdSeconds: { control: { type: "number", min: 0.5, step: 0.5 }, description: "Seconds held on screen before exit" },
  },
  render: (args) => {
    const slug = slugify(`${args.code}-${formatEventDate(args.dateISO)}`) || "event-date";
    const job: RenderJob = { id: "single", label: `${args.code} · ${formatEventDate(args.dateISO)}`, filename: slug, props: args };
    return (
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        <RenderQueuePanel title="Export event tag" jobs={[job]} compositionId="EventDate" entry="src/index.ts" />
        {render(args)}
      </div>
    );
  },
};

/** The locked design from the backlog sketch — `KCRX` box on the right edge,
 * `JULY.19.26` plain word inward, top-right corner, over sky. */
export const Main: Story = {
  args: { code: "KCRX", dateISO: "2026-07-19", holdSeconds: 3 },
  render,
};
