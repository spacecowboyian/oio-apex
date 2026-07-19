import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import { LowerThird } from "./LowerThird";
import { LowerThirdProps, LowerThirdBatchItem } from "./types";
import { computeLowerThirdDuration, computeLowerThirdHeldFrame } from "./LowerThird";
import { RenderQueuePanel, RenderJob } from "../dev-tools/RenderQueuePanel";
import exampleBatch from "../../lower-third-configs/example-batch.json";
import { color, fontStack, type } from "../theme";

/** same working reference photo the leaderboard stories composite against —
 * real footage, not a flat color, so the "box contrasts with its own
 * background" rule can actually be eyeballed. */
const PHOTO_URL = "/betty-datsun-521.png";

const meta: Meta<typeof LowerThird> = {
  title: "Video/Lower Third",
  parameters: { layout: "padded" },
  argTypes: {
    anchor: { control: "radio", options: ["left", "right"] },
    surface: { control: "radio", options: ["dark", "light"] },
  },
};
export default meta;

type Story = StoryObj<typeof LowerThird>;

const VideoWindow: React.FC<{ surface: "dark" | "light"; width?: number; height?: number; children: React.ReactNode }> = ({
  surface,
  width = 640,
  height = 360,
  children,
}) => (
  <div
    style={{
      width,
      height,
      // dark surface composites over the real reference photo; light surface has
      // no matching real-footage plate yet, so fall back to a flat light frame
      // (same gradient the static CornerLabel story uses) — enough to check the
      // box/plain contrast swap, not a substitute for real footage once available.
      ...(surface === "dark"
        ? { backgroundImage: `url(${PHOTO_URL})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { background: "linear-gradient(180deg, #c7ccd1 0%, #eceef0 100%)" }),
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

/** frozen on the fully-revealed hold frame, controls off — reuses the real
 * component/Player instead of a hand-drawn mockup, so it can never drift
 * from what the animation actually settles into. Sits next to the animated
 * player so you can see the end state at a glance instead of scrubbing for
 * it. */
const StaticFrame: React.FC<{ args: LowerThirdProps; width?: number; height?: number }> = ({
  args,
  width,
  height,
}) => (
  <VideoWindow surface={args.surface} width={width} height={height}>
    <Player
      component={LowerThird}
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
  </VideoWindow>
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

const render = (args: LowerThirdProps) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <div>
      <div style={captionStyle}>Static — fully out</div>
      <StaticFrame args={args} />
    </div>
    <div>
      <div style={captionStyle}>Animated</div>
      <VideoWindow surface={args.surface}>
        <Player
          component={LowerThird}
          inputProps={args}
          fps={30}
          durationInFrames={computeLowerThirdDuration(args.holdSeconds)}
          compositionWidth={1920}
          compositionHeight={1080}
          style={{ width: "100%", height: "100%" }}
          controls
          loop
        />
      </VideoWindow>
    </div>
  </div>
);

/** filesystem-safe filename from a fact+name pair — same approach as the
 * leaderboard playground's title slug, just keyed on this component's own
 * identifying fields instead of an event title. */
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Single-item playground — for hand-building one lower third at a time via
 * the Controls panel (fact/name/anchor/surface/holdSeconds), no JSON typing
 * required. Mirrors the leaderboard Playground's per-field-control pattern.
 * Use `BatchPlayground` below instead when generating several at once (e.g.
 * an agent producing a whole video's worth).
 */
export const Playground: StoryObj<LowerThirdProps> = {
  args: { fact: "85 MR2", name: "GOBLIN", anchor: "right", surface: "dark", holdSeconds: 3 },
  argTypes: {
    fact: { control: "text", description: "Left side — year/chassis/model or event category" },
    name: { control: "text", description: "Right side — driver/name/owner" },
    holdSeconds: { control: { type: "number", min: 0.5, step: 0.5 }, description: "Seconds held on screen before exit" },
  },
  render: (args) => {
    const slug = slugify(`${args.fact}-${args.name}`) || "lower-third";
    const job: RenderJob = { id: "single", label: `${args.fact} · ${args.name}`, filename: slug, props: args };
    return (
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        <RenderQueuePanel title="Export lower third" jobs={[job]} compositionId="LowerThird" entry="src/index.ts" />
        {render(args)}
      </div>
    );
  },
};

/**
 * Batch playground — the workflow for generating several at once: an agent
 * (or a human) writes a JSON array of lower thirds for an entire video in
 * one go (see lower-third-configs/example-batch.json for the shape), pastes
 * it into the `items` control below, and gets a live preview of every one
 * plus a single export panel. `RenderQueuePanel`'s own "combine" checkbox is
 * the one-file-vs-individual-files choice — off exports one clip per item,
 * on stitches the whole batch into one file afterward.
 *
 * This is deliberately just a JSON array, not a form per field — a batch is
 * naturally many items at once, and pasting a whole array an agent already
 * generated is the actual expected workflow, not building it one item at a
 * time through controls (use `Playground` above for that).
 */
export const BatchPlayground: StoryObj<{ items: LowerThirdBatchItem[] }> = {
  args: { items: exampleBatch as LowerThirdBatchItem[] },
  argTypes: {
    items: {
      control: "object",
      description:
        "Array of lower thirds to generate at once — each is a full LowerThirdProps (fact/name/anchor/surface/holdSeconds), plus an optional `id` to disambiguate two entries that would otherwise share a filename. Paste a whole JSON array here — e.g. one an agent wrote for a full video's worth of lower thirds.",
    },
  },
  render: ({ items }) => {
    const jobs: RenderJob[] = items.map((item, i) => {
      const slug = item.id ? slugify(item.id) : slugify(`${item.fact}-${item.name}`) || `lower-third-${i + 1}`;
      return { id: `item-${i}-${slug}`, label: `${item.fact} · ${item.name}`, filename: slug, props: item };
    });

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }}>
        <RenderQueuePanel
          title="Export lower thirds"
          jobs={jobs}
          compositionId="LowerThird"
          entry="src/index.ts"
          combinedFilename="lower-thirds-combined"
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {items.map((item, i) => (
            <div key={i}>
              <div
                style={{
                  fontFamily: fontStack("helvetica"),
                  fontSize: type.scale.caption,
                  fontWeight: 700,
                  color: color.base.muted,
                  marginBottom: 6,
                  maxWidth: 320,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.fact} · {item.name}
              </div>
              <StaticFrame args={item} width={320} height={180} />
              <VideoWindow surface={item.surface} width={320} height={180}>
                <Player
                  component={LowerThird}
                  inputProps={item}
                  fps={30}
                  durationInFrames={computeLowerThirdDuration(item.holdSeconds)}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  style={{ width: "100%", height: "100%" }}
                  autoPlay
                  loop
                  controls
                />
              </VideoWindow>
            </div>
          ))}
        </div>
      </div>
    );
  },
};

/** The house style — white box, entering from the right. This is the only
 * variant actually in use; `Root.tsx`'s defaultProps matches it. The other
 * two stories below stay only as a reference for the anchor/surface options
 * the component still supports, not alternates in rotation. */
export const Main: Story = {
  args: { fact: "85 MR2", name: "GOBLIN", anchor: "right", surface: "dark" },
  render,
};

export const ReferenceLeftAnchor: Story = {
  args: { fact: "09 FIT", name: "FIDDY CENT", anchor: "left", surface: "dark" },
  render,
};

export const ReferenceLightSurface: Story = {
  args: { fact: "09 FIT", name: "FIDDY CENT", anchor: "left", surface: "light" },
  render,
};
