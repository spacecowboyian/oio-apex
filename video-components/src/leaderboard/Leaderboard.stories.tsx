import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import { LeaderboardComposition, LeaderboardProps, resolveConfig } from "./Leaderboard";
import { StaticFullList } from "./StaticPreview";
import { RenderQueuePanel, RenderJob } from "../dev-tools/RenderQueuePanel";
import { LeaderboardConfig } from "./types";
import { computeDuration, WIDTH_FOR_EVENT, ROW_HEIGHT, TITLE_HEIGHT } from "./layout";
import { DATASET_SIZES, DATASET_RUN_COUNTS, DatasetSize, generateFakeRacers, fakeFeaturedNames } from "./fakeData";

import track from "../../leaderboard-configs/track.json";
import autocrossLeader from "../../leaderboard-configs/autocross-leader.json";
import autocrossManualFeatured from "../../leaderboard-configs/autocross-manual-featured.json";
import autocrossFinalResults from "../../leaderboard-configs/autocross-final-results.json";
import autocrossClassManual from "../../leaderboard-configs/autocross-class-manual.json";
import autocrossClassLeaderOverflow from "../../leaderboard-configs/autocross-class-leader-overflow.json";
import rallycross from "../../leaderboard-configs/rallycross.json";
import autocrossPositionChange from "../../leaderboard-configs/autocross-position-change.json";

/** filesystem/URL-safe filename slug from the story's free-text `title` control
 * (e.g. "EST · EVENT 4" -> "est-event-4") — export filenames are named after
 * this, not the generic "run"/"final", since it's the only on-screen thing
 * that identifies which event a batch of exports belongs to. */
const slugify = (text: string | null | undefined): string =>
  (text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents split out by NFKD (é -> e + combining acute)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const meta: Meta = {
  title: "Video/Race Leaderboard",
  // "centered" clips anything wider than the viewport with no way to scroll
  // to it — fine for the single-video-window fixed stories, but Playground's
  // three-panel layout is wider than a typical laptop screen. "padded" gives
  // normal scrollable block layout instead.
  parameters: { layout: "padded" },
};
export default meta;

const basePlayerProps = {
  fps: 30,
  compositionWidth: 1920,
  compositionHeight: 1080,
  style: { width: 640, height: 360 },
  controls: true,
};

/** the working reference photo (refs/betty-datsun-521.png, copied into public/ —
 * see README) — a preview-only backdrop composited in Storybook so a board can be
 * eyeballed against real footage. Never part of the actual rendered composition
 * (`LeaderboardComposition` is transparent everywhere but the board itself); real
 * footage takes its place once this drops into an editor as an overlay track. */
const PHOTO_URL = "/betty-datsun-521.png";

/**
 * A small "monitor" frame — the photo as a background plate, sized to exactly
 * match its child `<Player>`'s displayed box so the leaderboard composites
 * over it with zero letterboxing (both are 16:9). Storybook-only chrome.
 */
const VideoWindow: React.FC<{ label: string; width: number; height: number; children: React.ReactNode }> = ({
  label,
  width,
  height,
  children,
}) => (
  <div>
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#8a8a8a",
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <div
      style={{
        width,
        height,
        backgroundImage: `url(${PHOTO_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #333",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      {children}
    </div>
  </div>
);

/**
 * Playground / generator — every `LeaderboardConfig` field gets its own
 * control (eventType/highlightMode as selects, title as text, featured/racers
 * as editable arrays). This is the data contract any future results-import
 * tool should target — see README.md. `config`, if set, overrides all the
 * individual fields at once (the same "pass a whole object or the individual
 * pieces" pattern the real component supports — useful for pasting in a
 * complete config to preview in one shot).
 *
 * `dataset` picks where `racers` comes from: `"manual"` uses the `racers`
 * control below exactly as edited; `"short"`/`"medium"`/`"long"` (5/9/16
 * racers) generate a fresh invented roster of that size instead (see
 * fakeData.ts) — "long" always overflows into the scrolling board. Autocross
 * and rallycross only (track has no runs concept to invent).
 *
 * `throughRun` is the generator part: a dropdown (Run 1, Run 2, ..., Final)
 * that regenerates the leaderboard as it stood after that run — the
 * component recomputes standings from the sliced `runs` itself (see
 * runProgress.ts), nothing to precompute by hand. "Final" (the default)
 * shows the complete result. Static by default; toggle `autoPlay` to see the
 * full entrance/scroll for whichever run is selected.
 *
 * Picking a specific run (not "Final") also turns on the position-change
 * camera-follow animation — `previousThroughRun` defaults to "Auto" (just
 * "the run before `throughRun`"; Run 1 has no previous run, so it's always a
 * static/scrolling board there) but can be set to a specific run instead,
 * e.g. to skip ahead by more than one run at a time. Needs at least one
 * `featured` name for the animation to actually have something to show.
 *
 * This is for occasional manual/human use — the primary workflow (an agent
 * writing a config JSON and rendering it via `--props`) doesn't need this UI
 * at all, it just sets `throughRun` in the JSON or the CLI props directly.
 */
const defaultArgs = autocrossManualFeatured as LeaderboardConfig;

/** one coherent example per event type — the fallback when `racers` doesn't
 * match whatever `eventType` is currently selected (see `render` below). */
const defaultConfigByEvent = {
  track: track as LeaderboardConfig,
  autocross: autocrossManualFeatured as LeaderboardConfig,
  rallycross: rallycross as LeaderboardConfig,
};

/** does this racer shape actually match the event type? Switching the
 * `eventType` dropdown alone (without also regenerating `racers`) otherwise
 * leaves stale, wrong-shaped data in place — e.g. autocross racers (no
 * `total`) under `eventType: "rallycross"` — which crashes deeper in the
 * render (rallycross's cells read `r.total`, autocross's don't have one). */
const racersMatchEventType = (racers: LeaderboardProps["racers"], eventType: LeaderboardProps["eventType"]) => {
  if (!racers || racers.length === 0) return false;
  const sample = racers[0] as Record<string, unknown>;
  if (eventType === "track") return "pos" in sample && "gap" in sample;
  if (eventType === "rallycross") return "runs" in sample && "total" in sample;
  return "runs" in sample;
};

const runLabels: Record<string, string> = { final: "Final" };
for (let i = 1; i <= 10; i++) runLabels[i] = `Run ${i}`;

const previousRunLabels: Record<string, string> = { auto: "Auto (run before)" };
for (let i = 1; i <= 10; i++) previousRunLabels[i] = `Run ${i}`;

export const Playground: StoryObj<
  Omit<LeaderboardProps, "throughRun" | "previousThroughRun"> & {
    autoPlay: boolean;
    throughRun: number | "final";
    previousThroughRun: number | "auto";
    dataset: DatasetSize | "manual";
  }
> = {
  args: {
    eventType: defaultArgs.eventType,
    title: defaultArgs.title,
    highlightMode: defaultArgs.highlightMode,
    featured: defaultArgs.featured,
    racers: defaultArgs.racers,
    config: undefined,
    throughRun: "final",
    previousThroughRun: "auto",
    finalResults: false,
    finalResultsScope: "all",
    dataset: "manual",
    autoPlay: false,
  },
  argTypes: {
    eventType: {
      control: "select",
      options: ["track", "autocross", "rallycross"],
      description: "Which row layout + highlight semantics to use",
    },
    highlightMode: {
      control: "select",
      options: ["leader", "manual"],
      description: '"leader" highlights P1 automatically; "manual" highlights `featured` by name',
    },
    title: { control: "text", description: "Optional title row locked to the top of the board" },
    featured: {
      control: "object",
      description:
        "Racer names to highlight — only used when highlightMode is \"manual\". Ignored while `dataset` is not \"manual\" (a matching pair is auto-picked from the generated roster).",
    },
    racers: {
      control: "object",
      description:
        "The roster — each racer's `runs` is every run so far, raw seconds, oldest first. Only used while `dataset` is \"manual\".",
    },
    config: {
      control: "object",
      description: "Overrides ALL fields above at once when set — pass a complete LeaderboardConfig",
    },
    dataset: {
      control: "radio",
      options: ["manual", "short", "medium", "long"],
      description:
        '"manual" edits the racers control directly below. short/medium/long generate a fresh invented roster — 5/9/16 racers with 3/6/9 runs each respectively (both roster size and run count scale with the tier) — "long" always overflows into the scrolling board. Autocross/rallycross only.',
    },
    throughRun: {
      control: { type: "select", labels: runLabels },
      options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "final"],
      description: "Generate the board as of this run (autocross/rallycross) — \"Final\" is the complete result",
    },
    previousThroughRun: {
      control: { type: "select", labels: previousRunLabels },
      options: ["auto", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      description:
        'The run the position-change animation starts from. "Auto" (default) is just whatever run comes before `throughRun` — Run 1 (or "Final" with nothing after it) has no previous run, so those stay a plain static/scrolling board. Pick a specific run to skip ahead by more than one (e.g. animate from Run 1 straight to Run 5).',
    },
    finalResults: {
      control: "boolean",
      description: "Minimal two-column, full-bleed-left final-results table instead of the standard board",
    },
    finalResultsScope: {
      control: "radio",
      options: ["all", "featured"],
      description:
        '"featured" (only meaningful with finalResults on) narrows to the winner + featured racers, and brings the rank circle back',
    },
    autoPlay: { control: "boolean", description: "Play the entrance/scroll animation automatically (only affects the live-preview window — the full roster on the left is always static, and the final-state window is always frozen)" },
  },
  render: (args) => {
    const { autoPlay, throughRun, previousThroughRun, dataset, ...leaderboardProps } = args;
    // "Auto" is just whatever run comes before `throughRun` — Run 1 (or
    // "Final" with nothing picked after it) has no previous run, so it
    // stays a plain static/scrolling board. Picking a specific run instead
    // overrides that, e.g. to skip ahead by more than one run at a time.
    const autoPrevious = typeof throughRun === "number" && throughRun > 1 ? throughRun - 1 : null;
    let props: LeaderboardProps = {
      ...leaderboardProps,
      throughRun: throughRun === "final" ? null : throughRun,
      previousThroughRun: previousThroughRun === "auto" ? autoPrevious : previousThroughRun,
    };
    if (dataset !== "manual" && (props.eventType === "autocross" || props.eventType === "rallycross")) {
      const n = DATASET_SIZES[dataset];
      props = {
        ...props,
        racers: generateFakeRacers(props.eventType, n, DATASET_RUN_COUNTS[dataset]),
        highlightMode: "manual",
        featured: fakeFeaturedNames(n),
      };
    } else if (!props.config && props.eventType && !racersMatchEventType(props.racers, props.eventType)) {
      // `eventType` was switched (via its own dropdown) without also
      // regenerating `racers` to match — fall back to that event's own
      // bundled example instead of crashing several layers down.
      const fallback = defaultConfigByEvent[props.eventType];
      props = { ...props, racers: fallback.racers, highlightMode: fallback.highlightMode, featured: fallback.featured };
    }
    const config = resolveConfig(props);
    const duration = computeDuration(config, 30);
    // a few frames before the exit-drawer would start sliding away — the
    // board fully settled into its last standings, not mid-exit.
    const finalFrame = Math.max(0, duration - 25);

    // the full roster is rendered at its real size (same width/row-height as
    // the actual board) then scaled down to fit a fixed max width — it's a
    // data-glance panel, not meant to compete for space with the two video
    // windows next to it.
    const staticMaxWidth = 400;
    const staticWidth = WIDTH_FOR_EVENT[config.eventType];
    const staticHeight = (config.title ? TITLE_HEIGHT : 0) + config.racers.length * ROW_HEIGHT;
    const staticScale = Math.min(1, staticMaxWidth / staticWidth);

    const windowWidth = 640;
    const windowHeight = 360;
    const bigPlayerProps = { fps: 30, compositionWidth: 1920, compositionHeight: 1080, style: { width: windowWidth, height: windowHeight } };

    // one batch-export job per run snapshot, straight from the event data —
    // `config.racers` (not `props.racers`) so this is correct whether the
    // roster came from individual fields, generated fake data, or a whole
    // `config` object pasted into the override control. Track has no runs
    // concept, so it only ever gets "Final".
    const maxRuns =
      config.eventType === "track" ? 0 : Math.max(0, ...config.racers.map((r) => ("runs" in r ? r.runs.length : 0)));
    // overriding `throughRun`/`previousThroughRun` has to go wherever the
    // component actually reads them from: nested inside `config` when that
    // override is set (it wins outright over the top-level fields — see
    // `resolveConfig`), otherwise at the top level.
    const withRun = (n: number | null, prev: number | null): LeaderboardProps =>
      props.config
        ? { config: { ...props.config, throughRun: n, previousThroughRun: prev } as LeaderboardConfig }
        : { ...props, throughRun: n, previousThroughRun: prev };
    // filenames are named after the event, not the generic "run"/"final" —
    // the `title` control (e.g. "EST · EVENT 4") is the only thing on screen
    // that actually identifies WHICH event a batch of exports belongs to,
    // so it's what every file (and the combined file) gets named after.
    const eventSlug = slugify(config.title) || config.eventType;
    const runJobs: RenderJob[] = Array.from({ length: maxRuns }, (_, i) => {
      const n = i + 1;
      return {
        id: `run-${n}`,
        label: `Run ${n}`,
        filename: `${eventSlug}-run-${n}`,
        props: withRun(n, n > 1 ? n - 1 : null),
      };
    });
    const jobs: RenderJob[] = [
      ...runJobs,
      { id: "final", label: "Final", filename: `${eventSlug}-final`, props: withRun(null, null) },
    ];

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }}>
        <RenderQueuePanel
          title="Export runs"
          jobs={jobs}
          compositionId="Leaderboard"
          entry="src/index.ts"
          combinedFilename={`${eventSlug}-combined`}
        />
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#8a8a8a",
              marginBottom: 6,
            }}
          >
            Full roster (static)
          </div>
          <div style={{ width: staticWidth * staticScale, height: staticHeight * staticScale, overflow: "hidden" }}>
            <div style={{ width: staticWidth, transform: `scale(${staticScale})`, transformOrigin: "top left" }}>
              <StaticFullList config={config} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <VideoWindow label="Final state" width={windowWidth} height={windowHeight}>
            <Player
              component={LeaderboardComposition}
              inputProps={props}
              durationInFrames={duration}
              initialFrame={finalFrame}
              autoPlay={false}
              controls={false}
              {...bigPlayerProps}
            />
          </VideoWindow>
          <VideoWindow label="Live preview" width={windowWidth} height={windowHeight}>
            <Player
              component={LeaderboardComposition}
              inputProps={props}
              durationInFrames={duration}
              autoPlay={autoPlay}
              loop
              controls
              {...bigPlayerProps}
            />
          </VideoWindow>
        </div>
      </div>
    );
  },
};

const fixedStory = (config: LeaderboardConfig): StoryObj => ({
  render: () => (
    <VideoWindow label={config.title ?? config.eventType} width={640} height={360}>
      <Player
        component={LeaderboardComposition}
        inputProps={config}
        durationInFrames={computeDuration(config, 30)}
        autoPlay
        loop
        {...basePlayerProps}
        style={{ width: 640, height: 360 }}
      />
    </VideoWindow>
  ),
});

/** Track (and any lap-time event) — the plain standing board, ranked by gap to leader. */
export const Track: StoryObj = fixedStory(track as LeaderboardConfig);

/** Autocross, leader mode — every row shows fastest + last run; P1 highlighted automatically. */
export const AutocrossLeader: StoryObj = fixedStory(autocrossLeader as LeaderboardConfig);

/** Autocross, manual highlight — Hudson Smith + Miles Smith featured, regardless of standing. */
export const AutocrossManualFeatured: StoryObj = fixedStory(autocrossManualFeatured as LeaderboardConfig);

/**
 * Autocross class board, manual highlight — full 12-driver real EST field,
 * Hudson Smith + Miles Smith featured. Roster overflows the compact
 * footprint, so the board locks edge-to-edge and scrolls from the lowest
 * featured racer up to the top, holding 4s on each.
 */
export const AutocrossClassManual: StoryObj = fixedStory(autocrossClassManual as LeaderboardConfig);

/**
 * Autocross class board, leader mode — same 12-racer overflow, but nobody's
 * manually featured, so it's one continuous scroll from the bottom of the
 * field to the top (P1), no holds along the way.
 */
export const AutocrossClassLeaderOverflow: StoryObj = fixedStory(
  autocrossClassLeaderOverflow as LeaderboardConfig,
);

/** Rallycross — fastest + last + total (cumulative), ranked by total. Hudson + Miles featured. */
export const Rallycross: StoryObj = fixedStory(rallycross as LeaderboardConfig);

/**
 * Final-results table, featured scope — winner + Hudson Smith + Miles Smith
 * only, out of the full 12-driver field. Minimal two-column layout, flush
 * against the left edge with no margin, rank circle back since position is
 * meaningful again at this size.
 */
export const AutocrossFinalResults: StoryObj = fixedStory(autocrossFinalResults as LeaderboardConfig);

/**
 * Position-change "camera follow" — holds on standings as of `previousThroughRun`
 * (RUN 1), then every row slides to its `throughRun` (RUN 2) standing while the
 * camera tracks whichever `featured` racer moved the most, clamping at the
 * board's top/bottom once there's no more room to scroll. Stats, rank, and the
 * run-number label all swap mid-slide. Miles Smith jumps last-to-first here
 * (an exaggerated invented swing, not real data) to stress-test the clamp;
 * Hudson Smith moves a more modest 5 spots alongside him.
 */
export const AutocrossPositionChange: StoryObj = fixedStory(autocrossPositionChange as LeaderboardConfig);
