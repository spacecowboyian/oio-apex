import React from "react";
import { AbsoluteFill } from "remotion";
import { LeaderboardShell, Cell, RowState } from "./LeaderboardShell";
import { LeaderboardConfig, EventType, HighlightMode, RacerRecord } from "./types";
import { trackRowCells, autocrossRowCells, rallycrossRowCells, rankCell } from "./rowCells";
import { trackFinalResultCells, autocrossFinalResultCells, rallycrossFinalResultCells } from "./finalResultsCells";
import { computeLayout, computeScrollPlan, WIDTH_FOR_EVENT, FINAL_RESULTS_WIDTH } from "./layout";
import {
  deriveStandings,
  derivePositionSequence,
  scopeToFeatured,
  RankedRunRacer,
  RankedRallycrossRacer,
} from "./runProgress";
import { fastestOf } from "./time";

/** right-edge title-bar indicator for which run's standings are on screen — "FINAL" once every run's in. */
const runLabelFor = (n: number | null | undefined): string => (n ? `RUN ${n}` : "FINAL");

/** name of whoever currently holds the fastest single run in the field — independent of standings/featured. */
export const fastestRacerName = (racers: RankedRunRacer[]): string | null =>
  racers.length === 0
    ? null
    : racers.reduce((best, r) => (fastestOf(r.runs) < fastestOf(best.runs) ? r : best)).name;

/** prepends the rank circle to an existing cell renderer — used when finalResultsScope
 * narrows the roster down to just a few racers, where position becomes meaningful again. */
const withRankColumn =
  <T extends { pos: number }>(cells: (r: T, i: number, s: RowState) => Cell[]) =>
  (r: T, i: number, s: RowState): Cell[] => [rankCell(r, s), ...cells(r, i, s)];

const renderBoard = <T extends { pos: number; name: string }>(
  racers: T[],
  renderCells: (row: T, index: number, state: RowState) => Cell[],
  width: number,
  title: string | null | undefined,
  rowState: (row: T, index: number) => RowState,
  featuredNames: string[],
  animateOut: boolean,
  runLabel?: string | null,
) => {
  const layout = computeLayout(racers.length, Boolean(title) || Boolean(runLabel));
  const plan = layout.locked ? computeScrollPlan(racers, featuredNames, layout.viewportRows) : null;
  return (
    <LeaderboardShell
      width={width}
      top={layout.locked ? 0 : undefined}
      title={title}
      runLabel={runLabel}
      animateOut={animateOut}
      rows={racers}
      rowState={rowState}
      renderCells={renderCells}
      scroll={
        plan
          ? {
              viewportRows: layout.viewportRows,
              rowHeight: layout.rowHeight,
              stops: plan.stops,
              holdAtStart: plan.holdFirst,
            }
          : undefined
      }
    />
  );
};

const renderPositionTransitionBoard = <T extends { pos: number; name: string }>(
  steps: T[][],
  renderCells: (row: T, index: number, state: RowState) => Cell[],
  width: number,
  title: string | null | undefined,
  stepRowState: (row: T, stepIndex: number) => RowState,
  moverNames: string[],
  animateOut: boolean,
  fromRunLabel?: string | null,
  toRunLabel?: string | null,
) => {
  const finalRacers = steps[steps.length - 1];
  const layout = computeLayout(finalRacers.length, Boolean(title) || Boolean(fromRunLabel) || Boolean(toRunLabel));
  return (
    <LeaderboardShell
      width={width}
      top={layout.locked ? 0 : undefined}
      title={title}
      animateOut={animateOut}
      renderCells={renderCells}
      positionTransition={{
        steps,
        moverNames,
        stepRowState,
        viewportRows: layout.viewportRows,
        rowHeight: layout.rowHeight,
        fromRunLabel,
        toRunLabel,
      }}
    />
  );
};

/**
 * The single leaderboard component — every event type and every size of
 * roster goes through this. Given a `LeaderboardConfig` (see types.ts for the
 * data contract), it picks the right row renderer, the right highlight rule,
 * and the right layout (compact card vs. edge-to-edge scrolling board) —
 * there's nothing else to wire up by hand. Standings (`pos`) are never data
 * you supply for autocross/rallycross — `deriveStandings` computes them from
 * `runs`/`total` every time (see runProgress.ts).
 *
 * `finalResults` swaps in the minimal two-column, full-bleed-left variant
 * (see finalResultsCells.tsx). `finalResultsScope: "featured"` additionally
 * narrows that down to just the winner + featured racers, bringing the rank
 * circle back since position is meaningful again at that size.
 *
 * Every row carries two independent flags: `featured` (yellow, explicit —
 * the driver we care about) and `fastest` (green — whoever currently holds
 * the best single run, independent of standings). A featured racer who's
 * also currently fastest keeps the yellow row but gets a green accent on
 * their fast/total cell (see rowCells.tsx).
 */
export const Leaderboard: React.FC<{ config: LeaderboardConfig }> = ({ config: rawConfig }) => {
  const config = deriveStandings(rawConfig);
  const { title, highlightMode, featured, finalResults, finalResultsScope } = config;
  const animateOut = config.animateOut ?? true;
  const featuredNames = highlightMode === "manual" ? featured ?? [] : [];
  const isFeatured = (row: { pos: number; name: string }) =>
    highlightMode === "leader" ? row.pos === 1 : featuredNames.includes(row.name);
  const isFinal = Boolean(finalResults);
  const isFeaturedScope = isFinal && finalResultsScope === "featured";
  const width = isFinal ? FINAL_RESULTS_WIDTH : WIDTH_FOR_EVENT[config.eventType];
  // the position-change camera-follow animation is a distinct presentation from
  // both the normal scroll-stop board and the final-results table — only takes
  // over when there's actually a `previousThroughRun` snapshot to animate from,
  // and it's not meaningful alongside `finalResults` (no rank/position drama at
  // that minimal size) or with nobody `featured` to point the camera at.
  const sequence = !isFinal && featuredNames.length > 0 ? derivePositionSequence(rawConfig) : null;

  switch (config.eventType) {
    case "track": {
      const racers = isFeaturedScope ? scopeToFeatured(config.racers, featuredNames) : config.racers;
      const rowState = (row: { pos: number; name: string }): RowState => ({
        featured: isFeatured(row),
        fastest: false,
      });
      return renderBoard(
        racers,
        isFinal
          ? isFeaturedScope
            ? withRankColumn(trackFinalResultCells)
            : trackFinalResultCells
          : trackRowCells,
        width,
        title,
        rowState,
        featuredNames,
        animateOut,
      );
    }
    case "autocross": {
      if (sequence && sequence.steps[0].eventType === "autocross") {
        const steps = sequence.steps.map((s) => s.racers as RankedRunRacer[]);
        const stepFastest = steps.map((racers) => fastestRacerName(racers));
        const stepRowState = (row: RankedRunRacer, stepIndex: number): RowState => ({
          featured: isFeatured(row),
          fastest: row.name === stepFastest[stepIndex],
        });
        return renderPositionTransitionBoard(
          steps,
          autocrossRowCells,
          width,
          title,
          stepRowState,
          sequence.moverNames,
          animateOut,
          runLabelFor(rawConfig.previousThroughRun),
          runLabelFor(config.throughRun),
        );
      }
      const fastestName = fastestRacerName(config.racers);
      const racers = isFeaturedScope ? scopeToFeatured(config.racers, featuredNames) : config.racers;
      const rowState = (row: { pos: number; name: string }): RowState => ({
        featured: isFeatured(row),
        fastest: row.name === fastestName,
      });
      return renderBoard(
        racers,
        isFinal
          ? isFeaturedScope
            ? withRankColumn(autocrossFinalResultCells)
            : autocrossFinalResultCells
          : autocrossRowCells,
        width,
        title,
        rowState,
        featuredNames,
        animateOut,
        isFinal ? undefined : runLabelFor(config.throughRun),
      );
    }
    case "rallycross": {
      if (sequence && sequence.steps[0].eventType === "rallycross") {
        const steps = sequence.steps.map((s) => s.racers as RankedRallycrossRacer[]);
        const stepFastest = steps.map((racers) => fastestRacerName(racers));
        const stepRowState = (row: RankedRallycrossRacer, stepIndex: number): RowState => ({
          featured: isFeatured(row),
          fastest: row.name === stepFastest[stepIndex],
        });
        return renderPositionTransitionBoard(
          steps,
          rallycrossRowCells,
          width,
          title,
          stepRowState,
          sequence.moverNames,
          animateOut,
          runLabelFor(rawConfig.previousThroughRun),
          runLabelFor(config.throughRun),
        );
      }
      const fastestName = fastestRacerName(config.racers);
      const racers = isFeaturedScope ? scopeToFeatured(config.racers, featuredNames) : config.racers;
      const rowState = (row: { pos: number; name: string }): RowState => ({
        featured: isFeatured(row),
        fastest: row.name === fastestName,
      });
      return renderBoard(
        racers,
        isFinal
          ? isFeaturedScope
            ? withRankColumn(rallycrossFinalResultCells)
            : rallycrossFinalResultCells
          : rallycrossRowCells,
        width,
        title,
        rowState,
        featuredNames,
        animateOut,
        isFinal ? undefined : runLabelFor(config.throughRun),
      );
    }
  }
};

/**
 * Props for `LeaderboardComposition` — every `LeaderboardConfig` field is
 * also accepted directly (top-level), for individually-controllable Storybook
 * args/props. Pass `config` to override all of them at once (useful for the
 * CLI `--props` workflow, or any caller that already has a full config
 * object) — when present, `config` wins outright over the individual fields.
 */
export type LeaderboardProps = {
  config?: LeaderboardConfig;
  eventType?: EventType;
  title?: string | null;
  highlightMode?: HighlightMode;
  featured?: string[] | null;
  racers?: RacerRecord[];
  throughRun?: number | null;
  finalResults?: boolean | null;
  finalResultsScope?: "all" | "featured" | null;
  previousThroughRun?: number | null;
  animateOut?: boolean | null;
};

export const resolveConfig = (props: LeaderboardProps): LeaderboardConfig => {
  if (props.config) return props.config;
  const {
    eventType,
    highlightMode,
    racers,
    title,
    featured,
    throughRun,
    finalResults,
    finalResultsScope,
    previousThroughRun,
    animateOut,
  } = props;
  if (!eventType || !highlightMode || !racers) {
    throw new Error(
      "Leaderboard: pass either a full `config` or eventType + highlightMode + racers directly.",
    );
  }
  // the individual-fields path is a convenience layer (Storybook controls, ad-hoc
  // props) — it trusts the caller to pass a `racers` shape matching `eventType`,
  // same as the JSON config files do.
  return {
    eventType,
    highlightMode,
    racers,
    title,
    featured,
    throughRun,
    finalResults,
    finalResultsScope,
    previousThroughRun,
    animateOut,
  } as LeaderboardConfig;
};

/**
 * What Remotion actually renders — the leaderboard alone, transparent
 * everywhere else in the frame. This is meant to be exported as a PNG
 * sequence or alpha-channel QuickTime and composited over real footage in an
 * editor, so it deliberately carries no background plate of its own — any
 * photo/video behind it during development (Storybook) is a preview-only
 * convenience layered on in the story, never baked into the render. Accepts
 * either a full `config` object or the individual fields directly, so a
 * config JSON file can be handed straight to `--props` with no wrapper:
 *   npx remotion render src/index.ts Leaderboard out/name.mp4 --props=./leaderboard-configs/name.json
 */
export const LeaderboardComposition: React.FC<LeaderboardProps> = (props) => (
  <AbsoluteFill>
    <Leaderboard config={resolveConfig(props)} />
  </AbsoluteFill>
);
