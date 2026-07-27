import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import { color, fontStack, type as typeScale } from "../theme";
import { RenderQueuePanel, RenderJob } from "../dev-tools/RenderQueuePanel";
import { PartsListComposition, PartsListProps, resolveConfig } from "./PartsList";
import { PartsListConfig, Orientation } from "./types";
import { computeLayout, computeDuration, allDurations, segmentRange, fullSheetLayout } from "./layout";
import { Receipt } from "./Receipt";
import type { ReceiptState } from "./choreography";
import { formatMoney, netTo, sumTo, budgetStateFor } from "./money";
import { DATASETS, PRESETS, DATASET_IDS, PRESET_IDS, mergeConfig, DatasetData, PresetOptions } from "./registry";
import { scriptFaceState } from "./scriptFont";
import "../foundations/fonts";

const meta: Meta = {
  title: "Video/Parts List",
  // "padded", not "centered" — the Playground puts the export panel beside the
  // player and the pair is wider than a laptop viewport, which "centered" clips
  // with no way to scroll to it.
  parameters: { layout: "padded" },
};
export default meta;

const slugify = (text: string | null | undefined): string =>
  (text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** the working reference photo, same preview-only backdrop the leaderboard
 * stories use — the composition itself is transparent everywhere but the sheet,
 * so this stands in for the footage it will overlay in the edit. */
const PHOTO_URL = "/betty-datsun-521.png";

const VideoWindow: React.FC<{ label: string; width: number; height: number; children: React.ReactNode }> = ({
  label,
  width,
  height,
  children,
}) => (
  <div>
    <div
      style={{
        fontFamily: fontStack("helvetica"),
        fontSize: typeScale.scale.caption,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: color.base.muted,
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <div
      style={{
        width,
        height,
        // Storybook-only preview chrome. The rule guards Remotion compositions and
        // this plate is never part of one — PartsListComposition is transparent
        // everywhere outside the sheet, and real footage replaces this in the edit.
        // eslint-disable-next-line @remotion/no-background-image
        backgroundImage: `url(${PHOTO_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  </div>
);

/**
 * The finished sheet on its own, off any frame: every line printed, the final
 * total, nothing windowed or animating. This is the receipt as a physical
 * object rather than as an overlay, which is the thing to look at when you are
 * checking the ledger itself — row rhythm, column alignment, how long the paper
 * runs — instead of how it sits in a shot.
 *
 * Drawn straight through `Receipt`, the pure state-to-pixels component, so it
 * is the same renderer the video uses and cannot drift from it.
 */
const FullReceipt: React.FC<{ config: PartsListConfig; width: number }> = ({ config, width }) => {
  const layout = fullSheetLayout(config);
  const m = layout.metrics;
  const scale = width / m.width;
  const state: ReceiptState = {
    printed: config.items.length,
    windowTop: 0,
    total: netTo(config.items, config.items.length),
    arrival: config.items.map(() => 1),
    struck: config.items.map((i) => (i.voidedAt != null ? 1 : 0)),
  };
  return (
    <div>
      <div
        style={{
          fontFamily: fontStack("helvetica"),
          fontSize: typeScale.scale.caption,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: color.base.muted,
          marginBottom: 6,
        }}
      >
        {`Full receipt · all ${config.items.length} lines`}
      </div>
      {/* Receipt places itself at the metrics' left/top because it normally
          sits in a video frame. Here it is the whole element, so the offset is
          cancelled against a zero-size positioned parent rather than by giving
          Receipt a second, preview-only positioning mode. */}
      <div style={{ width, height: layout.sheetHeight * scale }}>
        <div
          style={{
            width: m.width,
            height: layout.sheetHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", left: -m.left, top: -m.top, width: 0, height: 0 }}>
            <Receipt config={config} layout={layout} state={state} />
          </div>
        </div>
      </div>
    </div>
  );
};

/** Frame size for an orientation, honouring an explicit override. */
const frameFor = (config: PartsListConfig): { width: number; height: number } => ({
  width: config.frameWidth ?? (config.orientation === "portrait" ? 1080 : 1920),
  height: config.frameHeight ?? (config.orientation === "portrait" ? 1920 : 1080),
});

const compositionFor = (config: PartsListConfig): string =>
  config.orientation === "portrait" ? "PartsListVertical" : "PartsList";

/** Human label for an appearance, for the export list and the readout. */
const appearanceLabel = (config: PartsListConfig, a: number | "recap"): string => {
  if (a === "recap") return `Recap · tallies ${formatMoney(sumTo(config.items, config.items.length))}`;
  const { start, end } = segmentRange(config.segments, a);
  const total = sumTo(config.items, end);
  const state = budgetStateFor(total, config.budget);
  const delta = config.budget != null ? ` · ${state === "over" ? "over" : "under"} ${formatMoney(config.budget - total)}` : "";
  return `${a + 1} · opens on ${start} → adds ${end - start} · ${formatMoney(total)}${delta}`;
};

/**
 * A note when the brand script isn't embedded. This is not cosmetic: Remotion
 * renders in a Chrome Headless Shell that cannot see macOS system fonts, so a
 * missing SignPainter means real output — not just this preview — draws the hero
 * total in a fallback face, silently. Same class of bug `foundations/fonts.ts`
 * records for the corner labels.
 */
const ScriptFaceNote: React.FC = () => {
  const state = scriptFaceState();
  if (state === "embedded") return null;
  return (
    <div
      style={{
        fontFamily: fontStack("mono"),
        fontSize: 12,
        lineHeight: 1.5,
        color: color.core.grit.ramp[300],
        border: `1px solid ${color.core.grit.ramp[700]}`,
        padding: "10px 12px",
        maxWidth: 420,
      }}
    >
      <strong>SignPainter is not embedded.</strong> The hero total is rendering in a fallback face — and it will do the
      same in a headless render, which cannot see macOS system fonts. Drop the licensed file at{" "}
      <code>public/fonts/SignPainter.ttf</code> (and mirror it into <code>packages/tokens/fonts/</code>) to fix both.
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Playground / generator + export panel
 * ------------------------------------------------------------------ */

type PlaygroundArgs = {
  datasetId: string;
  presetId: string;
  appearance: string;
  orientation: Orientation;
  budget: number;
  maxRows: number;
  emphasisSeconds: number;
  partBeatSeconds: number;
  autoPlay: boolean;
  items: PartsListConfig["items"];
  segments: number[];
  title: string;
};

const firstDataset = Object.keys(DATASETS)[0];

export const Playground: StoryObj<PlaygroundArgs> = {
  args: {
    datasetId: firstDataset,
    presetId: "landscape",
    appearance: "0",
    orientation: "landscape",
    budget: 800,
    maxRows: 0,
    emphasisSeconds: 1.5,
    partBeatSeconds: 2.4,
    autoPlay: false,
    items: DATASETS[firstDataset].items,
    segments: DATASETS[firstDataset].segments,
    title: DATASETS[firstDataset].title ?? "",
  },
  argTypes: {
    datasetId: {
      control: "select",
      options: DATASET_IDS,
      description:
        'Which SAVED ledger to render (data only: title, items, segments, budget). "manual" instead drives the list from the `items`/`segments`/`title`/`budget` controls below. Save a new one as `parts-list-configs/datasets/<id>.json` plus a registry entry — see registry.ts.',
    },
    presetId: {
      control: "select",
      options: PRESET_IDS,
      description:
        'Which SAVED options preset to apply over the ledger (orientation, frame, row cap, pacing — no project identity). "custom" drives options from the individual controls instead.',
    },
    appearance: {
      control: "select",
      options: ["0", "1", "2", "3", "4", "5", "recap"],
      description:
        "Which visit to render. Each appearance is its own clip — the video cuts away between them — so this is a render-time selector, not a timeline position. Options beyond the ledger's segment count fall back to the last one.",
    },
    orientation: {
      control: "radio",
      options: ["landscape", "portrait"],
      description:
        "Landscape hangs the sheet off the frame's top edge beside footage. Portrait sits it in the upper band with the lower half free and caps the window at five rows. Also decides which composition the export panel renders.",
    },
    budget: { control: { type: "number", step: 25 }, description: "The target. 0 removes the budget block entirely." },
    maxRows: {
      control: { type: "number", step: 1 },
      description: "Cap the window below what the frame could fit. 0 = use the orientation default (portrait 5, landscape uncapped).",
    },
    emphasisSeconds: {
      control: { type: "number", step: 0.1 },
      description: "Seconds held after the last part of this appearance lands, before the closing beat.",
    },
    partBeatSeconds: {
      control: { type: "number", step: 0.2 },
      description:
        "Seconds between one part landing and the next. Parts always arrive one at a time — this is the room to SPEAK to each before the next shows up, and it sets the clip's length (n parts ≈ n × this, plus the open and close beats).",
    },
    items: { control: "object", description: 'Ledger lines when `datasetId` is "manual". `price` is a raw number; `est: true` marks an estimate and renders a leading ≈.' },
    segments: { control: "object", description: 'How many parts each appearance adds, in order. Sum ≤ items.length; a shorter sum leaves the tail unprinted (a project still in progress).' },
    autoPlay: { control: "boolean" },
  },
  render: (args) => {
    const {
      datasetId,
      presetId,
      appearance,
      orientation,
      budget,
      maxRows,
      emphasisSeconds,
      partBeatSeconds,
      autoPlay,
      items,
      segments,
      title,
    } = args;

    const data: DatasetData =
      datasetId === "manual"
        ? { title, items, segments, budget: budget > 0 ? budget : null }
        : { ...DATASETS[datasetId], budget: budget > 0 ? budget : null };

    const options: PresetOptions =
      presetId === "custom"
        ? {
            orientation,
            maxRows: maxRows > 0 ? maxRows : null,
            emphasisSeconds,
            partBeatSeconds,
            animateOut: null,
            frameWidth: null,
            frameHeight: null,
          }
        : {
            ...PRESETS[presetId],
            orientation,
            maxRows: maxRows > 0 ? maxRows : PRESETS[presetId].maxRows,
            emphasisSeconds,
            partBeatSeconds,
          };

    const segCount = data.segments.length;
    const selected: number | "recap" =
      appearance === "recap" ? "recap" : Math.min(parseInt(appearance, 10) || 0, Math.max(0, segCount - 1));

    const config = mergeConfig(data, options, selected);
    const layout = computeLayout(config);
    const duration = computeDuration(config, 30);
    const compositionId = compositionFor(config);

    // Both cuts are previewed side by side whatever `orientation` is set to.
    // The same appearance reads differently in each — portrait caps at five
    // rows and travels sooner — and the two are shipped together, so seeing
    // only the selected one hides half of every pacing decision. `orientation`
    // still decides which composition the export panel targets.
    const cuts = (["landscape", "portrait"] as const).map((o) => {
      // Each cut starts from ITS OWN saved preset, not from the selected one
      // with `orientation` swapped: a preset carries explicit frameWidth and
      // frameHeight, so swapping only the orientation left the portrait cut
      // being drawn into a 1920x1080 frame. Only the pacing controls carry
      // across, since those are what the page is for.
      const cutBase: PresetOptions = PRESETS[o] ?? { ...options, orientation: o, frameWidth: null, frameHeight: null };
      const cutConfig = mergeConfig(
        data,
        {
          ...cutBase,
          emphasisSeconds,
          partBeatSeconds,
          maxRows: o === orientation && maxRows > 0 ? maxRows : (cutBase.maxRows ?? null),
        },
        selected,
      );
      const cutFrame = frameFor(cutConfig);
      // Sized so the two previews stand about the same HEIGHT rather than the
      // same width — a 9:16 cut shown at a landscape-ish width is too small to
      // judge the thing this page exists to judge.
      const cutWidth = o === "portrait" ? 300 : 560;
      return {
        orientation: o,
        config: cutConfig,
        frame: cutFrame,
        width: cutWidth,
        height: Math.round(cutWidth * (cutFrame.height / cutFrame.width)),
        duration: computeDuration(cutConfig, 30),
      };
    });

    const slug = slugify(config.title) || "parts-list";
    // One job per appearance plus the recap — this is the unit the edit actually
    // wants, since each appearance is a separate clip dropped at a different
    // point in the timeline.
    const durations = allDurations(config, 30);
    const jobs: RenderJob[] = [
      ...config.segments.map((_n, i) => {
        return {
          id: `a${i}`,
          label: `${appearanceLabel(config, i)} · ${(durations[i] / 30).toFixed(1)}s`,
          filename: `${slug}-${config.orientation}-a${i + 1}`,
          props: { config: { ...config, appearance: i } },
        };
      }),
      {
        id: "recap",
        label: `${appearanceLabel(config, "recap")} · ${(durations[durations.length - 1] / 30).toFixed(1)}s`,
        filename: `${slug}-${config.orientation}-recap`,
        props: { config: { ...config, appearance: "recap" } },
      },
    ];

    const total = sumTo(config.items, config.items.length);
    const state = budgetStateFor(total, config.budget);

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <RenderQueuePanel
            title="Export appearances"
            jobs={jobs}
            compositionId={compositionId}
            entry="src/index.ts"
            combinedFilename={`${slug}-${config.orientation}-all`}
          />
          <ScriptFaceNote />
          <div
            style={{
              fontFamily: fontStack("mono"),
              fontSize: 12,
              lineHeight: 1.7,
              color: color.base.muted,
              maxWidth: 420,
            }}
          >
            <div>
              row {layout.metrics.rowH}px fixed · window {layout.visibleRows} of {config.items.length}
              {layout.visibleRows < layout.frameCapacityRows ? ` (capped; frame fits ${layout.frameCapacityRows})` : ""}
            </div>
            <div>
              sheet {Math.round(layout.sheetHeight)}px at y={layout.metrics.top} · scrolls 0–{layout.scrollRange} rows
            </div>
            <div>
              {config.items.length} parts · {formatMoney(total)}
              {config.budget != null ? ` of ${formatMoney(config.budget)} · ${state} by ${formatMoney(config.budget - total)}` : " · no budget"}
            </div>
            <div>
              rendering appearance {selected === "recap" ? "recap" : selected + 1} · {(duration / 30).toFixed(1)}s ·{" "}
              {compositionId}
            </div>
          </div>
        </div>
        {cuts.map((cut) => (
          <VideoWindow
            key={cut.orientation}
            label={`${cut.orientation} · ${appearanceLabel(cut.config, selected)}`}
            width={cut.width}
            height={cut.height}
          >
            <Player
              component={PartsListComposition}
              inputProps={{ config: cut.config } satisfies PartsListProps}
              durationInFrames={cut.duration}
              fps={30}
              compositionWidth={cut.frame.width}
              compositionHeight={cut.frame.height}
              style={{ width: cut.width, height: cut.height }}
              autoPlay={autoPlay}
              loop
              controls
            />
          </VideoWindow>
        ))}
        <FullReceipt config={config} width={340} />
      </div>
    );
  },
};

/* ------------------------------------------------------------------ *
 * Fixed stories — the real Nessie ledger
 * ------------------------------------------------------------------ */

const nessie = DATASETS["nessie-exhaust"];

const fixedStory = (
  label: string,
  overrides: Partial<PartsListConfig>,
  displayWidth = 720,
): StoryObj => ({
  render: () => {
    const config = resolveConfig({
      config: { ...PRESETS.landscape, ...nessie, appearance: 0, ...overrides } as PartsListConfig,
    });
    const frame = frameFor(config);
    const displayHeight = Math.round(displayWidth * (frame.height / frame.width));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ScriptFaceNote />
        <VideoWindow label={label} width={displayWidth} height={displayHeight}>
          <Player
            component={PartsListComposition}
            inputProps={{ config } satisfies PartsListProps}
            durationInFrames={computeDuration(config, 30)}
            fps={30}
            compositionWidth={frame.width}
            compositionHeight={frame.height}
            style={{ width: displayWidth, height: displayHeight }}
            loop
            controls
          />
        </VideoWindow>
      </div>
    );
  },
});

/** First visit: five parts from the June cart land on an empty sheet, no scroll needed. */
export const FirstAppearance: StoryObj = fixedStory("Appearance 1 · +5 parts", { appearance: 0 });

/** Third visit: the list is now longer than the window, so it opens at row 1 and travels. */
export const ThirdAppearance: StoryObj = fixedStory("Appearance 3 · +2, travels", { appearance: 2 });

/** Closing pass: the finished sheet, tallying from zero while it travels. */
export const Recap: StoryObj = fixedStory("Recap · tallies the whole build", { appearance: "recap" });

/**
 * The same eleven parts against a $250 target. Crosses on the second
 * appearance — the 16" resonator and the V-band clamp take it from $196.89 to
 * $262.05 — so the axis runs to the total and the budget becomes a marked line.
 */
export const OverBudget: StoryObj = fixedStory("Over budget · $250 target", { appearance: 1, budget: 250 });

/** Portrait, five-row window, lower half of the frame left free. */
export const Portrait: StoryObj = fixedStory(
  "Portrait · appearance 4",
  { ...(PRESETS.portrait as Partial<PartsListConfig>), appearance: 3 },
  300,
);

/** No budget at all: the sheet still totals, the budget block simply isn't drawn. */
export const NoBudget: StoryObj = fixedStory("No budget", { appearance: "recap", budget: null });

