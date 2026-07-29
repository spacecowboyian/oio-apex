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
  rosterRowCells,
  rosterHeaderCells,
  rankCell,
} from "./rowCells";
import { trackFinalResultCells, autocrossFinalResultCells, rallycrossFinalResultCells } from "./finalResultsCells";
import { computeLayout, computeScrollPlan, WIDTH_FOR_EVENT, FINAL_RESULTS_WIDTH, FRAME_HEIGHT } from "./layout";
import {
  deriveStandings,
  derivePositionSequence,
  deriveTransitionSnapshots,
  scopeToFeatured,
  maxDisplayedGapSeconds,
  rosterOrder,
} from "./runProgress";

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
  heroFontSize?: number,
  rowReveal?: {
    startFrames: number;
    stepFrames: number;
    settleFrames: number;
    keepNames: string[];
  },
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
      heroFontSize={heroFontSize}
      rowReveal={rowReveal}
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
  columnHeadersTo?: Cell[],
  fromDim?: { opacity: number; keepNames: string[] },
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
      columnHeadersTo={columnHeadersTo}
      fromDim={fromDim}
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
  const isRoster = Boolean(config.roster);
  const isFinal = Boolean(finalResults);
  const isFeaturedScope = isFinal && finalResultsScope === "featured";
  const width = isFinal ? FINAL_RESULTS_WIDTH : isPortrait ? frameWidth : WIDTH_FOR_EVENT[config.eventType];
  // the position-change camera-follow animation is a distinct presentation from
  // both the normal scroll-stop board and the final-results table — only takes
  // over when there's actually a `previousThroughRun` snapshot to animate from,
  // and it's not meaningful alongside `finalResults` (no rank/position drama at
  // that minimal size) or with nobody `featured` to point the camera at.
  const simultaneous = !isFinal && !isRoster && useSimultaneous ? deriveTransitionSnapshots(rawConfig) : null;
  const sequence =
    !isFinal && !isRoster && !useSimultaneous && featuredNames.length > 0 ? derivePositionSequence(rawConfig) : null;

  if (isRoster) {
    // OIO drivers first, then everyone else — both groups alphabetical. The
    // card's job is to introduce the people the video follows, so they lead;
    // the rest are the field they raced against, in a neutral order rather
    // than one that implies a result.
    const entrants = rosterOrder([...config.racers] as { name: string; car: string; pos: number }[], featuredNames);
    // Measured from the WHOLE event, exactly as the run boards do, so the entry
    // card reserves the same room for the columns it is about to grow. Without
    // this the DRIVER column is wider here than on run 1 and visibly snaps at
    // the handoff — the thing the shared header exists to prevent.
    const rosterMaxRun = Math.max(0, ...rawConfig.racers.flatMap((r) => ("runs" in r ? r.runs : [])));
    const rosterMaxDiff = maxDisplayedGapSeconds(rawConfig);
    // One centred line — event, class, date, separated by bullets — rather
    // than the title/date split the result boards use. Centred keeps it clear
    // of the platform UI that crowds both edges of a vertical feed.
    const heroLine = [title, config.eventDate].filter(Boolean).join(" • ");
    // The hero style is a single unwrapped line, so it has to be sized to fit
    // rather than left at its 44px default: at 44 this string overruns 1080.
    //
    // It gets nearly the full frame width, NOT the row safe margins — the row
    // margins exist to keep left-aligned text clear of the like/comment rail,
    // and a centred line is already clear of both edges by construction. Only
    // a token inset is kept.
    //
    // 0.57em per character is the uppercase-Helvetica advance ratio measured
    // off a real render of this exact line (772px of ink at 32px over 43
    // characters), not a guess — an earlier 0.62 estimate undersized the type
    // by about 20%.
    // Centred, but still inset — centring alone doesn't clear the platform UI
    // if the line is nearly frame-wide. Uses the WIDER of the two configured
    // safe margins on BOTH sides: symmetric so the line stays optically
    // centred, and sized to the worst edge so it clears the like/comment rail
    // rather than just the lighter one.
    // NB the hero row adds its own 30px of padding on top of this inset (see
    // LeaderboardShell's title bar), so the usable width is the frame minus
    // BOTH. Leaving the 30 out here overstated the budget and the line wrapped
    // to two.
    const heroInset = 30 + Math.max(leftSafeMargin, rightSafeMargin, 30);
    const heroRoom = width - 2 * heroInset;
    const heroFontSize = Math.max(20, Math.min(44, Math.floor(heroRoom / Math.max(1, heroLine.length * 0.57))));
    return renderBoard(
      entrants,
      rosterRowCells(entrants.map((r) => r.name), width, leftSafeMargin, rosterMaxRun, rosterMaxDiff, rightSafeMargin),
      width,
      null,
      // no featured/leader colouring: a highlighted row on an entry list reads
      // as a placing nobody has raced for yet. The fade-back below is what
      // separates our drivers from the field, after everyone has been seen.
      () => ({ featured: false, leader: false }),
      [],
      animateOut,
      frameHeight,
      enterAnimation,
      fillFrame,
      true,
      heroLine,
      // DRIVER/CAR labels. The event line still shows above them because
      // `heroRunLabel` stacks its own row on top of the column headers rather
      // than collapsing into them — and having this row means the card and the
      // roster -> run 1 leg share a layout, so nothing shifts at the handoff.
      rosterHeaderCells(entrants.map((r) => r.name), width, leftSafeMargin, rosterMaxRun, rosterMaxDiff, rightSafeMargin),
      false,
      // horizontal rules between entries — every other card in the set has them
      // and the entry card looked unruled by comparison
      true,
      topSafeMargin,
      leftSafeMargin,
      rightSafeMargin,
      heroFontSize,
      { startFrames: 8, stepFrames: 14, settleFrames: 20, keepNames: featuredNames },
    );
  }

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
        // The roster leg's `from` is the entry card, which has no standings at
        // all. It can't come from `previousThroughRun: 0` — `standingsWith
        // RunCounts` tests that count for truthiness, so 0 means "don't slice"
        // and hands back the FINAL results, which made the rows jump into
        // their finishing order the instant the leg started instead of sliding
        // out of the card. Build it directly: the same racers, in the same
        // roster order the card just showed, renumbered down the list. Their
        // numbers are irrelevant here — the `from` cells only draw name + car.
        const fromRacers = config.rosterTransition
          ? rosterOrder(simultaneous.to.racers, featuredNames).map((r, i) => ({ ...r, pos: i + 1 }))
          : simultaneous.from.racers;
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
        // `rawConfig`, NOT `config` — `deriveStandings` slices every racer's
        // `runs` down to this leg's `throughRun`, so measuring off `config`
        // only discovers a wide time once the leg that contains it arrives,
        // and the column visibly jumps mid-recap (found on KCRX E5: Andrew
        // Moll's 1:01.040 on run 4 bumped TIME wider from run 4 onward).
        // The unsliced roster is the only thing that's constant leg to leg.
        const rallycrossMaxRun = Math.max(0, ...rawConfig.racers.flatMap((r) => ("runs" in r ? r.runs : [])));
        const rallycrossMaxDiff = maxDisplayedGapSeconds(rawConfig);
        // On the roster -> run 1 leg the rows START as the entry card (name +
        // car) and become the run board at the same instant every other leg
        // swaps its numbers — `renderCellsTo` below is what they become. The
        // shell hard-swaps cell sets at that cutover rather than crossfading
        // them, so the two sets don't have to have matching column counts.
        const baseRallycrossCells = config.rosterTransition
          ? rosterRowCells(rallycrossNames, width, leftSafeMargin, rallycrossMaxRun, rallycrossMaxDiff, rightSafeMargin)
          : showPreviousCurrentRuns
            ? rallycrossPreviousCurrentRowCells(showFeaturedRowHighlight, rallycrossNames, width, showRank, leftSafeMargin, rallycrossMaxRun, rallycrossMaxDiff, rightSafeMargin)
            : rallycrossRowCells;
        const rallycrossCells =
          config.rosterTransition || !showRank ? (config.rosterTransition ? baseRallycrossCells : withoutRankColumn(baseRallycrossCells)) : baseRallycrossCells;
        const rallycrossRunCells = showPreviousCurrentRuns
          ? rallycrossPreviousCurrentRowCells(showFeaturedRowHighlight, rallycrossNames, width, showRank, leftSafeMargin, rallycrossMaxRun, rallycrossMaxDiff, rightSafeMargin)
          : rallycrossRowCells;
        const rallycrossRenderCellsTo = config.rosterTransition
          ? showRank
            ? rallycrossRunCells
            : withoutRankColumn(rallycrossRunCells)
          : showPreviousCurrentRuns && isFinalLeg
            ? showRank
              ? rallycrossFinalRevealCells(showFeaturedRowHighlight, rallycrossNames, width, showRank, leftSafeMargin, rallycrossMaxRun, rallycrossMaxDiff, rightSafeMargin)
              : withoutRankColumn(
                  rallycrossFinalRevealCells(showFeaturedRowHighlight, rallycrossNames, width, showRank, leftSafeMargin, rallycrossMaxRun, rallycrossMaxDiff, rightSafeMargin),
                )
            : undefined;
        // matches `rallycrossCells`, which stays RUN/TOTAL/DIFF for the whole
        // transition even on the rare single-shot (not chained) `previousThroughRun`
        // -> true-final case — `columnHeaders` has no from/to swap of its own,
        // unlike `renderCellsTo`.
        const rallycrossRunHeaders = showPreviousCurrentRuns
          ? rallycrossPreviousCurrentHeaderCells(showRank, rallycrossNames, width, leftSafeMargin, rallycrossMaxRun, rallycrossMaxDiff, rightSafeMargin)
          : undefined;
        // the roster leg starts wearing the card's own DRIVER/CAR labels and
        // swaps to the run columns at the same instant the rows do
        const rallycrossColumnHeaders = config.rosterTransition
          ? rosterHeaderCells(rallycrossNames, width, leftSafeMargin, rallycrossMaxRun, rallycrossMaxDiff, rightSafeMargin)
          : rallycrossRunHeaders;
        return renderSimultaneousTransitionBoard(
          fromRacers,
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
          config.rosterTransition
            ? // the entry card's own header, so the label CROSSFADES from the
              // event line into "RUN 1" instead of flashing "FINAL" —
              // `runLabelFor(0)` takes the falsy branch and would say FINAL.
              [title, config.eventDate].filter(Boolean).join(" • ")
            : runLabelFor(rawConfig.previousThroughRun),
          runLabelFor(config.throughRun),
          rallycrossColumnHeaders,
          showFeaturedRowHighlight,
          showPreviousCurrentRuns,
          config.runIntervalSeconds,
          config.simultaneousLegIsFirst ?? true,
          topSafeMargin,
          leftSafeMargin,
          rightSafeMargin,
          config.rosterTransition ? rallycrossRunHeaders : undefined,
          // carries the card's fade-back into this leg, so it opens on exactly
          // the frame the card ended on and eases back as the results commit
          config.rosterTransition ? { opacity: 0.3, keepNames: featuredNames } : undefined,
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
      // unsliced, for the same reason as `rallycrossMaxRun` above.
      const rallycrossPlainMaxRun = Math.max(0, ...rawConfig.racers.flatMap((r) => ("runs" in r ? r.runs : [])));
      const rallycrossPlainMaxDiff = maxDisplayedGapSeconds(rawConfig);
      const baseRallycrossPlainCells = showPreviousCurrentRuns
        ? isTrueFinalRun
          ? rallycrossFinalRevealCells(showFeaturedRowHighlight, rallycrossPlainNames, width, showRank, leftSafeMargin, rallycrossPlainMaxRun, rallycrossPlainMaxDiff, rightSafeMargin)
          : rallycrossPreviousCurrentRowCells(showFeaturedRowHighlight, rallycrossPlainNames, width, showRank, leftSafeMargin, rallycrossPlainMaxRun, rallycrossPlainMaxDiff, rightSafeMargin)
        : rallycrossRowCells;
      const rallycrossPlainColumnHeaders =
        !isFinal && showPreviousCurrentRuns
          ? isTrueFinalRun
            ? rallycrossFinalRevealHeaderCells(showRank, rallycrossPlainNames, width, leftSafeMargin, rallycrossPlainMaxRun, rallycrossPlainMaxDiff, rightSafeMargin)
            : rallycrossPreviousCurrentHeaderCells(showRank, rallycrossPlainNames, width, leftSafeMargin, rallycrossPlainMaxRun, rallycrossPlainMaxDiff, rightSafeMargin)
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
  roster?: boolean | null;
  rosterIntro?: boolean | null;
  rosterHoldSeconds?: number | null;
  eventDate?: string | null;
  fps?: number | null;
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
    roster,
    rosterIntro,
    rosterHoldSeconds,
    eventDate,
    fps,
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
    roster,
    rosterIntro,
    rosterHoldSeconds,
    eventDate,
    fps,
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
