import React from "react";
import { AbsoluteFill } from "remotion";
import { LeaderboardShell, Cell, RowState } from "./LeaderboardShell";
import { LeaderboardConfig, EventType, HighlightMode, RacerRecord } from "./types";
import {
  trackRowCells,
  autocrossRowCells,
  rallycrossRowCells,
  rallycrossPreviousCurrentRowCells,
  rallycrossFinalRevealCells,
  rallycrossPreviousCurrentHeaderCells,
  rallycrossFinalRevealHeaderCells,
  rankCell,
} from "./rowCells";
import { trackFinalResultCells, autocrossFinalResultCells, rallycrossFinalResultCells } from "./finalResultsCells";
import { computeLayout, computeScrollPlan, WIDTH_FOR_EVENT, FINAL_RESULTS_WIDTH, FRAME_HEIGHT } from "./layout";
import { deriveStandings, derivePositionSequence, deriveTransitionSnapshots, scopeToFeatured } from "./runProgress";

/** right-edge title-bar indicator for which run's standings are on screen — "FINAL" once every run's in. */
const runLabelFor = (n: number | null | undefined): string => (n ? `RUN ${n}` : "FINAL");

/** prepends the rank circle to an existing cell renderer — used when finalResultsScope
 * narrows the roster down to just a few racers, where position becomes meaningful again. */
const withRankColumn =
  <T extends { pos: number }>(cells: (r: T, i: number, s: RowState) => Cell[]) =>
  (r: T, i: number, s: RowState): Cell[] => [rankCell(r, s), ...cells(r, i, s)];

/** drops the rank-circle column an existing cell renderer prepends — every
 * `*RowCells` function in rowCells.tsx always puts it first. Used when
 * `showRank` is off. */
const withoutRankColumn =
  <T,>(cells: (r: T, i: number, s: RowState) => Cell[]) =>
  (r: T, i: number, s: RowState): Cell[] =>
    cells(r, i, s).slice(1);

const renderBoard = <T extends { pos: number; name: string }>(
  racers: T[],
  renderCells: (row: T, index: number, state: RowState) => Cell[],
  width: number,
  title: string | null | undefined,
  rowState: (row: T, index: number) => RowState,
  featuredNames: string[],
  animateOut: boolean,
  frameHeight: number,
  enterAnimation: boolean,
  fillFrame: boolean,
  heroRunLabel: boolean,
  runLabel?: string | null,
  columnHeaders?: Cell[],
  showFeaturedRowHighlight: boolean = true,
  showRowDividers: boolean = false,
  topSafeMargin: number = 0,
  leftSafeMargin: number = 0,
  rightSafeMargin: number = 0,
) => {
  const layout = computeLayout(racers.length, Boolean(title) || Boolean(runLabel), 0, frameHeight - topSafeMargin, fillFrame);
  const plan = layout.locked ? computeScrollPlan(racers, featuredNames, layout.viewportRows) : null;
  return (
    <LeaderboardShell
      width={width}
      leftPadding={leftSafeMargin}
      rightPadding={rightSafeMargin}
      top={layout.locked ? topSafeMargin : undefined}
      title={title}
      runLabel={runLabel}
      heroRunLabel={heroRunLabel}
      columnHeaders={columnHeaders}
      showFeaturedRowHighlight={showFeaturedRowHighlight}
      showRowDividers={showRowDividers}
      animateOut={animateOut}
      enterAnimation={enterAnimation}
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
  from: T[],
  to: T[],
  orderSteps: string[][],
  renderCells: (row: T, index: number, state: RowState) => Cell[],
  width: number,
  title: string | null | undefined,
  rowState: (row: T) => RowState,
  moverNames: string[],
  animateOut: boolean,
  frameHeight: number,
  enterAnimation: boolean,
  fillFrame: boolean,
  heroRunLabel: boolean,
  fromRunLabel?: string | null,
  toRunLabel?: string | null,
  showFeaturedRowHighlight: boolean = true,
  showRowDividers: boolean = false,
  topSafeMargin: number = 0,
  leftSafeMargin: number = 0,
  rightSafeMargin: number = 0,
) => {
  const layout = computeLayout(
    to.length,
    Boolean(title) || Boolean(fromRunLabel) || Boolean(toRunLabel),
    0,
    frameHeight - topSafeMargin,
    fillFrame,
  );
  return (
    <LeaderboardShell
      width={width}
      leftPadding={leftSafeMargin}
      rightPadding={rightSafeMargin}
      top={layout.locked ? topSafeMargin : undefined}
      title={title}
      heroRunLabel={heroRunLabel}
      showFeaturedRowHighlight={showFeaturedRowHighlight}
      showRowDividers={showRowDividers}
      animateOut={animateOut}
      enterAnimation={enterAnimation}
      renderCells={renderCells}
      positionTransition={{
        from,
        to,
        moverNames,
        orderSteps,
        rowState,
        viewportRows: layout.viewportRows,
        rowHeight: layout.rowHeight,
        fromRunLabel,
        toRunLabel,
      }}
    />
  );
};

const renderSimultaneousTransitionBoard = <T extends { pos: number; name: string }>(
  from: T[],
  to: T[],
  renderCells: (row: T, index: number, state: RowState) => Cell[],
  width: number,
  title: string | null | undefined,
  rowState: (row: T) => RowState,
  animateOut: boolean,
  frameHeight: number,
  enterAnimation: boolean,
  fillFrame: boolean,
  heroRunLabel: boolean,
  renderCellsTo: ((row: T, index: number, state: RowState) => Cell[]) | undefined,
  fromRunLabel?: string | null,
  toRunLabel?: string | null,
  columnHeaders?: Cell[],
  showFeaturedRowHighlight: boolean = true,
  showRowDividers: boolean = false,
  runIntervalSeconds?: number | null,
  legIsFirst: boolean = true,
  topSafeMargin: number = 0,
  leftSafeMargin: number = 0,
  rightSafeMargin: number = 0,
) => {
  const layout = computeLayout(
    to.length,
    Boolean(title) || Boolean(fromRunLabel) || Boolean(toRunLabel),
    0,
    frameHeight - topSafeMargin,
    fillFrame,
  );
  return (
    <LeaderboardShell
      width={width}
      leftPadding={leftSafeMargin}
      rightPadding={rightSafeMargin}
      top={layout.locked ? topSafeMargin : undefined}
      title={title}
      heroRunLabel={heroRunLabel}
      columnHeaders={columnHeaders}
      showFeaturedRowHighlight={showFeaturedRowHighlight}
      showRowDividers={showRowDividers}
      animateOut={animateOut}
      enterAnimation={enterAnimation}
      renderCells={renderCells}
      simultaneousTransition={{
        from,
        to,
        rowState,
        viewportRows: layout.viewportRows,
        rowHeight: layout.rowHeight,
        fromRunLabel,
        toRunLabel,
        renderCellsTo,
        legSeconds: runIntervalSeconds,
        legIsFirst,
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
 * the driver we care about) and `leader` (green — whoever currently holds
 * P1 overall). A featured racer who's also currently the leader keeps the
 * yellow row but gets a green accent on their fast/total cell (see
 * rowCells.tsx).
 */
export const Leaderboard: React.FC<{ config: LeaderboardConfig }> = ({ config: rawConfig }) => {
  const config = deriveStandings(rawConfig);
  const { title, highlightMode, featured, finalResults, finalResultsScope } = config;
  const animateOut = config.animateOut ?? true;
  const enterAnimation = config.enterAnimation ?? true;
  const fillFrame = config.fillFrame ?? false;
  const showRank = config.showRank ?? true;
  const showLeaderHighlight = config.showLeaderHighlight ?? true;
  const heroRunLabel = config.heroRunLabel ?? false;
  const showFeaturedRowHighlight = config.showFeaturedRowHighlight ?? true;
  const showPreviousCurrentRuns = config.showPreviousCurrentRuns ?? false;
  const useSimultaneous = config.simultaneousPositionChange ?? false;
  const frameWidth = config.frameWidth ?? 1920;
  const frameHeight = config.frameHeight ?? FRAME_HEIGHT;
  const topSafeMargin = config.topSafeMargin ?? 0;
  const leftSafeMargin = config.leftSafeMargin ?? 0;
  const rightSafeMargin = config.rightSafeMargin ?? 0;
  // portrait frames go full-bleed to the frame edge — there's no video real
  // estate beside the board to preserve, unlike landscape where it shares the
  // frame with footage and stays at a fixed narrower width per event type.
  const isPortrait = frameHeight > frameWidth;
  const featuredNames = highlightMode === "manual" ? featured ?? [] : [];
  const isFeatured = (row: { pos: number; name: string }) =>
    highlightMode === "leader" ? row.pos === 1 : featuredNames.includes(row.name);
  // `leader` (green) is just P1 — same rule for every snapshot, so the position-
  // transition boards reuse this for both `from` and `to` rather than needing
  // two separate closures.
  const rowState = (row: { pos: number; name: string }): RowState => ({
    featured: isFeatured(row),
    leader: showLeaderHighlight && row.pos === 1,
  });
  const isFinal = Boolean(finalResults);
  const isFeaturedScope = isFinal && finalResultsScope === "featured";
  const width = isFinal ? FINAL_RESULTS_WIDTH : isPortrait ? frameWidth : WIDTH_FOR_EVENT[config.eventType];
  // the position-change camera-follow animation is a distinct presentation from
  // both the normal scroll-stop board and the final-results table — only takes
  // over when there's actually a `previousThroughRun` snapshot to animate from,
  // and it's not meaningful alongside `finalResults` (no rank/position drama at
  // that minimal size) or with nobody `featured` to point the camera at.
  const simultaneous = !isFinal && useSimultaneous ? deriveTransitionSnapshots(rawConfig) : null;
  const sequence = !isFinal && !useSimultaneous && featuredNames.length > 0 ? derivePositionSequence(rawConfig) : null;

  switch (config.eventType) {
    case "track": {
      const racers = isFeaturedScope ? scopeToFeatured(config.racers, featuredNames) : config.racers;
      return renderBoard(
        racers,
        isFinal
          ? isFeaturedScope && showRank
            ? withRankColumn(trackFinalResultCells)
            : trackFinalResultCells
          : showRank
            ? trackRowCells
            : withoutRankColumn(trackRowCells),
        width,
        title,
        rowState,
        featuredNames,
        animateOut,
        frameHeight,
        enterAnimation,
        fillFrame,
        heroRunLabel,
        undefined,
        undefined,
        showFeaturedRowHighlight,
        false,
        topSafeMargin,
        leftSafeMargin,
        rightSafeMargin,
      );
    }
    case "autocross": {
      if (simultaneous && simultaneous.from.eventType === "autocross" && simultaneous.to.eventType === "autocross") {
        return renderSimultaneousTransitionBoard(
          simultaneous.from.racers,
          simultaneous.to.racers,
          showRank ? autocrossRowCells : withoutRankColumn(autocrossRowCells),
          width,
          title,
          rowState,
          animateOut,
          frameHeight,
          enterAnimation,
          fillFrame,
          heroRunLabel,
          undefined,
          runLabelFor(rawConfig.previousThroughRun),
          runLabelFor(config.throughRun),
          undefined,
          showFeaturedRowHighlight,
          false,
          config.runIntervalSeconds,
          config.simultaneousLegIsFirst ?? true,
          topSafeMargin,
          leftSafeMargin,
          rightSafeMargin,
        );
      }
      if (sequence && sequence.from.eventType === "autocross" && sequence.to.eventType === "autocross") {
        return renderPositionTransitionBoard(
          sequence.from.racers,
          sequence.to.racers,
          sequence.orderSteps,
          showRank ? autocrossRowCells : withoutRankColumn(autocrossRowCells),
          width,
          title,
          rowState,
          sequence.moverNames,
          animateOut,
          frameHeight,
          enterAnimation,
          fillFrame,
          heroRunLabel,
          runLabelFor(rawConfig.previousThroughRun),
          runLabelFor(config.throughRun),
          showFeaturedRowHighlight,
          false,
          topSafeMargin,
          leftSafeMargin,
          rightSafeMargin,
        );
      }
      const racers = isFeaturedScope ? scopeToFeatured(config.racers, featuredNames) : config.racers;
      return renderBoard(
        racers,
        isFinal
          ? isFeaturedScope && showRank
            ? withRankColumn(autocrossFinalResultCells)
            : autocrossFinalResultCells
          : showRank
            ? autocrossRowCells
            : withoutRankColumn(autocrossRowCells),
        width,
        title,
        rowState,
        featuredNames,
        animateOut,
        frameHeight,
        enterAnimation,
        fillFrame,
        heroRunLabel,
        isFinal ? undefined : runLabelFor(config.throughRun),
        undefined,
        showFeaturedRowHighlight,
        false,
        topSafeMargin,
        leftSafeMargin,
        rightSafeMargin,
      );
    }
    case "rallycross": {
      if (simultaneous && simultaneous.from.eventType === "rallycross" && simultaneous.to.eventType === "rallycross") {
        const isFinalLeg = config.throughRun == null;
        // the full roster's names, not just whichever leg's snapshot is on
        // screen right now — `recapColumnWidths` (rowCells.tsx) needs the
        // SAME name list on every leg, or the Driver/Time/Total/Diff column
        // widths would shift leg to leg as the widest name changes.
        const rallycrossNames = config.racers.map((r) => r.name);
        // widest single run across the WHOLE roster — sizes the TIME column so
        // minute-plus runs (a longer course, or a big autocross site) don't
        // overflow into TOTAL. Full roster, not the leg snapshot, so the width
        // stays constant leg to leg (same reason as `rallycrossNames`).
        const rallycrossMaxRun = Math.max(0, ...config.racers.flatMap((r) => ("runs" in r ? r.runs : [])));
        const baseRallycrossCells = showPreviousCurrentRuns
          ? rallycrossPreviousCurrentRowCells(showFeaturedRowHighlight, rallycrossNames, width, showRank, leftSafeMargin, rallycrossMaxRun)
          : rallycrossRowCells;
        const rallycrossCells = showRank ? baseRallycrossCells : withoutRankColumn(baseRallycrossCells);
        const rallycrossRenderCellsTo =
          showPreviousCurrentRuns && isFinalLeg
            ? showRank
              ? rallycrossFinalRevealCells(showFeaturedRowHighlight, rallycrossNames, width, showRank, leftSafeMargin, rallycrossMaxRun)
              : withoutRankColumn(
                  rallycrossFinalRevealCells(showFeaturedRowHighlight, rallycrossNames, width, showRank, leftSafeMargin, rallycrossMaxRun),
                )
            : undefined;
        // matches `rallycrossCells`, which stays RUN/TOTAL/DIFF for the whole
        // transition even on the rare single-shot (not chained) `previousThroughRun`
        // -> true-final case — `columnHeaders` has no from/to swap of its own,
        // unlike `renderCellsTo`.
        const rallycrossColumnHeaders = showPreviousCurrentRuns
          ? rallycrossPreviousCurrentHeaderCells(showRank, rallycrossNames, width, leftSafeMargin, rallycrossMaxRun)
          : undefined;
        return renderSimultaneousTransitionBoard(
          simultaneous.from.racers,
          simultaneous.to.racers,
          rallycrossCells,
          width,
          title,
          rowState,
          animateOut,
          frameHeight,
          enterAnimation,
          fillFrame,
          heroRunLabel,
          rallycrossRenderCellsTo,
          runLabelFor(rawConfig.previousThroughRun),
          runLabelFor(config.throughRun),
          rallycrossColumnHeaders,
          showFeaturedRowHighlight,
          showPreviousCurrentRuns,
          config.runIntervalSeconds,
          config.simultaneousLegIsFirst ?? true,
          topSafeMargin,
          leftSafeMargin,
          rightSafeMargin,
        );
      }
      if (sequence && sequence.from.eventType === "rallycross" && sequence.to.eventType === "rallycross") {
        return renderPositionTransitionBoard(
          sequence.from.racers,
          sequence.to.racers,
          sequence.orderSteps,
          showRank ? rallycrossRowCells : withoutRankColumn(rallycrossRowCells),
          width,
          title,
          rowState,
          sequence.moverNames,
          animateOut,
          frameHeight,
          enterAnimation,
          fillFrame,
          heroRunLabel,
          runLabelFor(rawConfig.previousThroughRun),
          runLabelFor(config.throughRun),
          showFeaturedRowHighlight,
          false,
          topSafeMargin,
          leftSafeMargin,
          rightSafeMargin,
        );
      }
      const racers = isFeaturedScope ? scopeToFeatured(config.racers, featuredNames) : config.racers;
      // a plain (non-transition) rallycross board still needs the
      // PREVIOUS/CURRENT or FASTEST/CONES/TOTAL columns when
      // `showPreviousCurrentRuns` is set — e.g. the simultaneous-mode final
      // book-end pair (see runSequence.ts) renders both halves of that
      // transition as plain boards, not a `simultaneousTransition`.
      const isTrueFinalRun = config.throughRun == null;
      // see the matching comment in the simultaneous-transition branch above
      // — full roster, so column widths stay put across every leg.
      const rallycrossPlainNames = config.racers.map((r) => r.name);
      // widest single run across the whole roster — sizes TIME, see the
      // matching comment in the simultaneous-transition branch above.
      const rallycrossPlainMaxRun = Math.max(0, ...config.racers.flatMap((r) => ("runs" in r ? r.runs : [])));
      const baseRallycrossPlainCells = showPreviousCurrentRuns
        ? isTrueFinalRun
          ? rallycrossFinalRevealCells(showFeaturedRowHighlight, rallycrossPlainNames, width, showRank, leftSafeMargin, rallycrossPlainMaxRun)
          : rallycrossPreviousCurrentRowCells(showFeaturedRowHighlight, rallycrossPlainNames, width, showRank, leftSafeMargin, rallycrossPlainMaxRun)
        : rallycrossRowCells;
      const rallycrossPlainColumnHeaders =
        !isFinal && showPreviousCurrentRuns
          ? isTrueFinalRun
            ? rallycrossFinalRevealHeaderCells(showRank, rallycrossPlainNames, width, leftSafeMargin, rallycrossPlainMaxRun)
            : rallycrossPreviousCurrentHeaderCells(showRank, rallycrossPlainNames, width, leftSafeMargin, rallycrossPlainMaxRun)
          : undefined;
      return renderBoard(
        racers,
        isFinal
          ? isFeaturedScope && showRank
            ? withRankColumn(rallycrossFinalResultCells)
            : rallycrossFinalResultCells
          : showRank
            ? baseRallycrossPlainCells
            : withoutRankColumn(baseRallycrossPlainCells),
        width,
        title,
        rowState,
        featuredNames,
        animateOut,
        frameHeight,
        enterAnimation,
        fillFrame,
        heroRunLabel,
        isFinal ? undefined : runLabelFor(config.throughRun),
        rallycrossPlainColumnHeaders,
        showFeaturedRowHighlight,
        !isFinal && showPreviousCurrentRuns,
        topSafeMargin,
        leftSafeMargin,
        rightSafeMargin,
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
  enterAnimation?: boolean | null;
  fillFrame?: boolean | null;
  frameWidth?: number | null;
  frameHeight?: number | null;
  topSafeMargin?: number | null;
  leftSafeMargin?: number | null;
  rightSafeMargin?: number | null;
  showRank?: boolean | null;
  showLeaderHighlight?: boolean | null;
  showFeaturedRowHighlight?: boolean | null;
  simultaneousPositionChange?: boolean | null;
  heroRunLabel?: boolean | null;
  showPreviousCurrentRuns?: boolean | null;
  runIntervalSeconds?: number | null;
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
    enterAnimation,
    fillFrame,
    frameWidth,
    frameHeight,
    topSafeMargin,
    leftSafeMargin,
    rightSafeMargin,
    showRank,
    showLeaderHighlight,
    showFeaturedRowHighlight,
    simultaneousPositionChange,
    heroRunLabel,
    showPreviousCurrentRuns,
    runIntervalSeconds,
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
    enterAnimation,
    fillFrame,
    frameWidth,
    frameHeight,
    topSafeMargin,
    leftSafeMargin,
    rightSafeMargin,
    showRank,
    showLeaderHighlight,
    showFeaturedRowHighlight,
    simultaneousPositionChange,
    heroRunLabel,
    showPreviousCurrentRuns,
    runIntervalSeconds,
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
