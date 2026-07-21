import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Player } from "@remotion/player";
import { LeaderboardComposition, LeaderboardProps, resolveConfig } from "./Leaderboard";
import { LeaderboardRunSequenceComposition } from "./LeaderboardRunSequence";
import { computeRunSequenceDuration } from "./runSequence";
import { StaticFullList } from "./StaticPreview";
import { RenderQueuePanel, RenderJob } from "../dev-tools/RenderQueuePanel";
import { LeaderboardConfig } from "./types";
import { computeDuration, WIDTH_FOR_EVENT, ROW_HEIGHT, TITLE_HEIGHT } from "./layout";
import { DATASET_SIZES, DATASET_RUN_COUNTS, DatasetSize, generateFakeRacers, fakeFeaturedNames } from "./fakeData";
import { DATASETS, PRESETS, DATASET_IDS, PRESET_IDS } from "./registry";
import { color, fontStack, frame, type } from "../theme";
import { SIMULTANEOUS_TRANSITION_DEFAULT_TOTAL_SECONDS } from "./layout";

import track from "../../leaderboard-configs/track.json";
import autocrossLeader from "../../leaderboard-configs/autocross-leader.json";
import autocrossManualFeatured from "../../leaderboard-configs/autocross-manual-featured.json";
import autocrossFinalResults from "../../leaderboard-configs/autocross-final-results.json";
import autocrossClassManual from "../../leaderboard-configs/autocross-class-manual.json";
import autocrossClassLeaderOverflow from "../../leaderboard-configs/autocross-class-leader-overflow.json";
import rallycross from "../../leaderboard-configs/rallycross.json";
import autocrossPositionChange from "../../leaderboard-configs/autocross-position-change.json";
import rallycrossRunSequence from "../../leaderboard-configs/rallycross-run-sequence.json";
import rallycrossRunSequenceStress from "../../leaderboard-configs/rallycross-run-sequence-stress.json";

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
        fontFamily: fontStack("helvetica"),
        fontSize: type.scale.caption,
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
    mode: "standard" | "shortForm";
    runIntervalSeconds: number;
    datasetId: string;
    presetId: string;
  }
> = {
  args: {
    mode: "standard",
    datasetId: "manual",
    presetId: "custom",
    runIntervalSeconds: SIMULTANEOUS_TRANSITION_DEFAULT_TOTAL_SECONDS,
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
    mode: {
      control: "radio",
      options: ["standard", "shortForm"],
      description:
        '"standard" renders the regular single-board generator below; "shortForm" (issue #13) renders the vertical-short run-by-run recap (`LeaderboardRunSequence` — see the ShortFormLeaderboard story). BOTH modes now read the same `datasetId`/`presetId` (or the manual controls) — flip `mode` to see one dataset both ways. shortForm needs runs data, so a track dataset there falls back to the bundled rallycross example.',
    },
    datasetId: {
      control: "select",
      options: DATASET_IDS,
      description:
        'Which SAVED dataset (event + roster, data only) to render. "manual" instead drives the roster from the `eventType`/`title`/`racers`/`featured` controls below (and the fake-roster `dataset` generator). Save a new one as `leaderboard-configs/datasets/<id>.json` + a registry entry — see registry.ts.',
    },
    presetId: {
      control: "select",
      options: PRESET_IDS,
      description:
        'Which SAVED options preset (presentation + pacing, no racer identity) to apply over the dataset. "custom" instead drives options from the individual controls (`finalResults`, etc.) with everything else defaulted. Save a new one as `leaderboard-configs/presets/<id>.json` + a registry entry.',
    },
    runIntervalSeconds: {
      control: { type: "range", min: 2, max: 20, step: 0.5 },
      description:
        'Only used in "shortForm" mode — total seconds each run stays on screen before cutting to the next (`LeaderboardConfig.runIntervalSeconds`, see layout.ts\'s `simultaneousLegFrames`). One knob for the whole leg\'s pacing instead of four separate constants to edit in code.',
    },
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
    const { autoPlay, throughRun, previousThroughRun, dataset, mode, runIntervalSeconds, datasetId, presetId, ...ctl } =
      args;

    // ── Resolve the DATA (event + roster) ────────────────────────────────
    // A saved dataset wins outright; "manual" builds from the individual
    // controls (and honours the fake-roster generator + eventType-mismatch
    // fallback the standard generator has always had).
    let data: Partial<LeaderboardProps>;
    if (datasetId !== "manual" && DATASETS[datasetId]) {
      data = { ...DATASETS[datasetId] };
    } else {
      data = {
        eventType: ctl.eventType,
        title: ctl.title,
        highlightMode: ctl.highlightMode,
        featured: ctl.featured,
        racers: ctl.racers,
      };
      if (dataset !== "manual" && (data.eventType === "autocross" || data.eventType === "rallycross")) {
        const n = DATASET_SIZES[dataset];
        data = {
          ...data,
          racers: generateFakeRacers(data.eventType, n, DATASET_RUN_COUNTS[dataset]),
          highlightMode: "manual",
          featured: fakeFeaturedNames(n),
        };
      } else if (data.eventType && !racersMatchEventType(data.racers, data.eventType)) {
        // eventType switched without regenerating racers — fall back to that
        // event's bundled example instead of crashing several layers down.
        const fallback = defaultConfigByEvent[data.eventType];
        data = { ...data, racers: fallback.racers, highlightMode: fallback.highlightMode, featured: fallback.featured };
      }
    }

    // ── Resolve the OPTIONS (presentation + pacing) ──────────────────────
    // A saved preset wins outright; "custom" uses the individual option
    // controls (only `finalResults`/`finalResultsScope` are exposed as
    // controls — everything else defaults unless a preset sets it).
    const options: Partial<LeaderboardProps> =
      presetId !== "custom" && PRESETS[presetId]
        ? { ...PRESETS[presetId] }
        : { finalResults: ctl.finalResults, finalResultsScope: ctl.finalResultsScope };

    // ── Merge ────────────────────────────────────────────────────────────
    // options first, data wins on identity, live `runIntervalSeconds` always
    // applies. The `config` paste box stays an all-or-nothing escape hatch,
    // honoured only in fully-manual/custom mode (matching prior behaviour).
    const pasteConfig = datasetId === "manual" && presetId === "custom" ? ctl.config : undefined;
    const baseProps: LeaderboardProps = pasteConfig
      ? { config: { ...(pasteConfig as LeaderboardConfig), runIntervalSeconds } }
      : ({ ...options, ...data, runIntervalSeconds } as LeaderboardProps);

    if (mode === "shortForm") {
      // The recap needs a full multi-run config (event + every racer's runs).
      // It reads the SAME merged dataset/preset (or manual controls) the
      // standard board does — so flipping `mode` shows one dataset both ways.
      // A dataset with no runs (track, or an empty manual roster) can't drive
      // a run-by-run recap, so it falls back to the bundled real
      // rallycross-run-sequence.json example. `runIntervalSeconds` always wins
      // over whatever the config itself sets — this page's one pacing knob.
      // Until a real dataset/preset/paste is chosen, keep the friendly default:
      // the bundled real rallycross recap (same as the ShortFormLeaderboard
      // story), rather than the default manual autocross roster.
      const usingSaved = datasetId !== "manual" || presetId !== "custom" || Boolean(pasteConfig);
      const shortFormSource = usingSaved ? resolveConfig(baseProps) : (rallycrossRunSequence as LeaderboardConfig);
      const hasRuns =
        Array.isArray(shortFormSource.racers) &&
        shortFormSource.racers.some(
          (r) => "runs" in r && Array.isArray((r as { runs?: number[] }).runs) && (r as { runs: number[] }).runs.length > 0,
        );
      const shortFormConfig = {
        ...(hasRuns ? shortFormSource : (rallycrossRunSequence as LeaderboardConfig)),
        runIntervalSeconds,
      } as LeaderboardConfig;
      const duration = computeRunSequenceDuration(shortFormConfig, 30);
      const compositionWidth = frame.verticalVideoLower.width;
      const compositionHeight = frame.verticalVideoLower.height;
      // 480, not 300 — at 300 (0.28x the 1080 native width) the row cells'
      // 22-34px padding shrinks to ~6-9px on screen, easy to misread as
      // missing entirely when eyeballing spacing in the Storybook preview.
      const displayWidth = 480;
      const displayHeight = Math.round(displayWidth * (compositionHeight / compositionWidth));
      const eventSlug = slugify(shortFormConfig.title) || shortFormConfig.eventType;
      const jobs: RenderJob[] = [
        {
          id: "short-form",
          label: "Short form recap",
          filename: `${eventSlug}-short-form`,
          props: { config: shortFormConfig },
        },
      ];

      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }}>
          <RenderQueuePanel
            title="Export short form"
            jobs={jobs}
            compositionId="LeaderboardRunSequence"
            entry="src/index.ts"
          />
          <VideoWindow label="Short form recap" width={displayWidth} height={displayHeight}>
            <Player
              component={LeaderboardRunSequenceComposition}
              inputProps={{ config: shortFormConfig }}
              durationInFrames={duration}
              fps={30}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              style={{ width: displayWidth, height: displayHeight, background: color.base.black }}
              autoPlay={autoPlay}
              loop
              controls
            />
          </VideoWindow>
        </div>
      );
    }

    // Data (roster, fake-generator, eventType-mismatch fallback) is already
    // resolved into `baseProps` up top — shared with shortForm. Here we only
    // layer on the run-selector controls. "Auto" is just whatever run comes
    // before `throughRun` — Run 1 (or "Final" with nothing after it) has no
    // previous run, so it stays a plain static/scrolling board; picking a
    // specific run overrides that (e.g. skip ahead more than one run).
    const autoPrevious = typeof throughRun === "number" && throughRun > 1 ? throughRun - 1 : null;
    const resolvedThroughRun = throughRun === "final" ? null : throughRun;
    const resolvedPreviousThroughRun = previousThroughRun === "auto" ? autoPrevious : previousThroughRun;
    // throughRun/previousThroughRun go wherever the component reads them from:
    // nested inside `config` when the paste override is set (it wins outright
    // over the top-level fields — see resolveConfig), otherwise top level.
    const props: LeaderboardProps = baseProps.config
      ? {
          config: {
            ...baseProps.config,
            throughRun: resolvedThroughRun,
            previousThroughRun: resolvedPreviousThroughRun,
          },
        }
      : { ...baseProps, throughRun: resolvedThroughRun, previousThroughRun: resolvedPreviousThroughRun };
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
              fontFamily: fontStack("helvetica"),
              fontSize: type.scale.caption,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: color.base.muted,
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

/**
 * Short Form Leaderboard (issue #13) — the run-by-run recap for vertical
 * shorts: chains the camera-follow transition across every run of the
 * event, back to back (`simultaneousPositionChange` + `showPreviousCurrentRuns`
 * in types.ts, see runSequence.ts), ending on the true final standings and
 * holding there instead of animating back out. Real KCR SCCA Rallycross
 * data — Ian/Larry/Ryan featured, Graham the unfeatured bystander — cone
 * hits and missed gates called out per driver in the PENALTY column
 * (rowCells.tsx), black row dividers between racers. Portrait
 * 1080×1312 — `LeaderboardVerticalLower`'s own crop, meant to sit directly
 * under a landscape clip stacked above it, not `fixedStory`'s 16:9 photo
 * backdrop (a different composition/duration function/aspect ratio
 * entirely, so this doesn't reuse `fixedStory`).
 */
export const ShortFormLeaderboard: StoryObj = {
  render: () => {
    const config = rallycrossRunSequence as LeaderboardConfig;
    const duration = computeRunSequenceDuration(config, 30);
    const compositionWidth = frame.verticalVideoLower.width;
    const compositionHeight = frame.verticalVideoLower.height;
    // 480, not 300 — at 300 (0.28x the 1080 native width) the row cells'
    // 22-34px padding shrinks to ~6-9px on screen, easy to misread as
    // missing entirely when eyeballing spacing in the Storybook preview.
    const displayWidth = 480;
    const displayHeight = Math.round(displayWidth * (compositionHeight / compositionWidth));
    return (
      <div>
        <div
          style={{
            fontFamily: fontStack("helvetica"),
            fontSize: type.scale.caption,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: color.base.muted,
            marginBottom: 6,
          }}
        >
          Short Form Leaderboard
        </div>
        <Player
          component={LeaderboardRunSequenceComposition}
          inputProps={{ config }}
          durationInFrames={duration}
          fps={30}
          compositionWidth={compositionWidth}
          compositionHeight={compositionHeight}
          style={{ width: displayWidth, height: displayHeight, background: color.base.black }}
          autoPlay
          loop
          controls
        />
      </div>
    );
  },
};

/** Small uppercase caption used above every preview window in this file —
 * factored out once `ShortFormFullVertical`/`ShortFormDeviceCrop` needed
 * a second, nested instance of it (a caption on the crop preview's OUTER
 * device frame, plus one on the inner composite it wraps). */
const CaptionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: fontStack("helvetica"),
      fontSize: type.scale.caption,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: color.base.muted,
      marginBottom: 6,
    }}
  >
    {children}
  </div>
);

/** The single frame both overview stories below freeze on — chosen because
 * it lands mid-hold on RUN 8 (not mid-slide/mid-crossfade) in
 * `STRESS_CONFIG`, and shows every pushed-limits case at once: an 11-char
 * name that still fits (`CHRISTOPHER`), a 10-char name with BOTH a cone and
 * a missed-gate badge stacked (`MAXIMILIAN`), a 3-cone bystander
 * (`ALEXANDRIA`), and the one name long enough to actually need the
 * ellipsis fallback (`BARTHOLOMEW` → `BARTHOLOM…`). Found by rendering
 * stills at a few candidate frames and eyeballing which one landed clean —
 * see git history for that search if this ever needs to move (e.g. after a
 * pacing change shifts leg boundaries). */
const STRESS_FRAME = 2200;

/** Same shape as the real `rallycross-run-sequence.json`, deliberately
 * pushed past what real KCR data has ever actually needed — longer names
 * (`Christopher`/`Maximilian`/`Bartholomew`/`Alexandria`, 10-11 chars vs.
 * the real roster's 3-6), higher cone counts (up to 5 cumulative), and at
 * least one missed gate per racer that has one — so the two overview
 * stories below are a real stress test of the safe-margin/adaptive-sizing
 * work, not just a demo of the easy case. Lives at
 * `leaderboard-configs/rallycross-run-sequence-stress.json`. */
const STRESS_CONFIG = rallycrossRunSequenceStress as LeaderboardConfig;

/**
 * The real composite Ian builds in DaVinci: the short-form recap (native
 * 1080×1312, top-anchored, transparent everywhere else) laid over a full
 * 1080×1920 vertical canvas, with footage filling the space below/behind
 * it (`PHOTO_URL` standing in for that footage here — same photo
 * `VideoWindow`'s 16:9 stories already use, just cover-cropped to portrait
 * instead of landscape). Frozen on `STRESS_FRAME` (a static image of one
 * run, not a looping video) — Storybook's own re-render/HMR cycle made an
 * autoplaying `Player` here more trouble than it was worth for a preview
 * that only needs to prove "does the layout survive worst-case data," not
 * "does the transition animation look good" (the standalone
 * `ShortFormLeaderboard` story already covers that separately). `displayWidth`
 * drives everything else so this one component can be reused at whatever
 * preview size a caller needs — the flat 9:16 story and the iPhone crop
 * preview both render this same composite, just at different sizes/inside
 * different crop frames.
 */
const FullVerticalComposite: React.FC<{
  config: LeaderboardConfig;
  duration: number;
  displayWidth: number;
}> = ({ config, duration, displayWidth }) => {
  const canvasW = frame.verticalVideo.width;
  const canvasH = frame.verticalVideo.height;
  const displayHeight = Math.round(displayWidth * (canvasH / canvasW));
  const boardW = frame.verticalVideoLower.width;
  const boardH = frame.verticalVideoLower.height;
  const boardDisplayWidth = displayWidth * (boardW / canvasW);
  const boardDisplayHeight = Math.round(boardDisplayWidth * (boardH / boardW));
  return (
    <div style={{ position: "relative", width: displayWidth, height: displayHeight, background: color.base.black, overflow: "hidden" }}>
      <img
        src={PHOTO_URL}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div style={{ position: "absolute", top: 0, left: 0, width: boardDisplayWidth, height: boardDisplayHeight }}>
        <Player
          component={LeaderboardRunSequenceComposition}
          inputProps={{ config }}
          durationInFrames={duration}
          fps={30}
          compositionWidth={boardW}
          compositionHeight={boardH}
          style={{ width: "100%", height: "100%" }}
          initialFrame={Math.min(STRESS_FRAME, duration - 1)}
          autoPlay={false}
          controls={false}
        />
      </div>
    </div>
  );
};

/**
 * The flat 9:16 master — exactly what gets exported/uploaded, no device
 * crop applied. Board flush at the top (per `topSafeMargin`/
 * `leftSafeMargin`/`rightSafeMargin` in the stress config), footage filling
 * the rest. Compare directly against `ShortFormDeviceCrop` below — same
 * composite, that one just shows what a real device's fullscreen player
 * crops away from it. Uses `STRESS_CONFIG` (long names, heavy cone/missed-
 * gate counts), not the real `rallycrossRunSequence` — see that constant's
 * comment.
 */
export const ShortFormFullVertical: StoryObj = {
  render: () => {
    const config = STRESS_CONFIG;
    const duration = computeRunSequenceDuration(config, 30);
    return (
      <div>
        <CaptionLabel>Full 9:16 master (1080×1920) — pushed-limits data, Run 8</CaptionLabel>
        <FullVerticalComposite config={config} duration={duration} displayWidth={340} />
      </div>
    );
  },
};

/**
 * What the SAME 1080×1920 master above actually looks like on an iPhone 16
 * Pro (2622×1206 native display, 6.3") INSIDE the real YouTube Shorts app —
 * corrected against an actual screenshot Ian sent (`IMG_0092.PNG`), not
 * derived from theoretical player behavior. The original version of this
 * story assumed a fullscreen "cover" player (scale up until BOTH axes fill
 * the screen, crop whatever overflows — the ~98px/side horizontal crop the
 * `leftSafeMargin`/`rightSafeMargin` values were originally sized against).
 * That assumption was wrong for this player: Ian's screenshot shows the
 * leaderboard's own row background touching both true screen edges (x=0
 * and x=1205 of a 1206px-wide screenshot) with zero gap, at multiple rows —
 * meaning the real player scales the video to match device WIDTH exactly
 * and does NOT crop the sides at all. It's a "fit-width" player, not
 * "cover": zero horizontal crop, and whatever vertical space the video
 * doesn't fill (or overflows past) is handled by the app's own UI chrome
 * above/below rather than a horizontal crop. Simulated with plain CSS (an
 * overflow:hidden device frame + a width-matched copy of
 * `FullVerticalComposite`, top-aligned since the board itself is
 * top-anchored) — not a capability of the Remotion composition itself, so
 * this only exists in Storybook, not in the actual render output.
 */
export const ShortFormDeviceCrop: StoryObj = {
  render: () => {
    const config = STRESS_CONFIG;
    const duration = computeRunSequenceDuration(config, 30);
    const masterW = frame.verticalVideo.width;
    const masterH = frame.verticalVideo.height;
    // iPhone 16 Pro native panel: 2622x1206px, 6.3in, portrait.
    const deviceW = 1206;
    const deviceH = 2622;
    const outerHeight = 340 * (masterH / masterW);
    const outerWidth = outerHeight * (deviceW / deviceH);
    // fit-width scale — matches device width exactly, zero horizontal crop
    // (see this story's own doc comment for the screenshot evidence). The
    // resulting height is naturally taller than the device screen itself
    // (2622x1206 is proportionally narrower/taller than 9:16), which is
    // exactly what real vertical video does in this player too — the
    // `overflow: hidden` device frame below just clips the bottom, same as
    // "the rest is below the fold, scroll to see it" in the real app.
    const widthScale = outerWidth / masterW;
    const innerDisplayWidth = masterW * widthScale;
    return (
      <div>
        <CaptionLabel>iPhone 16 Pro, real YouTube Shorts app — pushed-limits data, Run 8 (zero horizontal crop, confirmed against a real screenshot)</CaptionLabel>
        <div
          style={{
            width: outerWidth,
            height: outerHeight,
            overflow: "hidden",
            position: "relative",
            background: "#000000",
            border: `1px solid ${color.base.line}`,
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0 }}>
            <FullVerticalComposite config={config} duration={duration} displayWidth={innerDisplayWidth} />
          </div>
        </div>
      </div>
    );
  },
};
