import { color } from "../theme";
import { TrackRacer } from "./types";
import { RankedRunRacer, RankedRallycrossRacer } from "./runProgress";
import { RankCircle } from "./RankCircle";
import { StatBlock, MUTED_ENDCAP_BG, MUTED_ENDCAP_TEXT } from "./RunStats";
import { Cell, RowState } from "./LeaderboardShell";
import { fastestOf, lastOf, formatGap, totalCones, formatRunTime } from "./time";
import { displayName } from "./format";

// white text on both highlighted row backgrounds now that they're the darker
// ramp step (spark.ramp[700] / flag.ramp[900] — see rowBgFor); light gray otherwise.
// (`color.base.muted` — a real token; `color.base.text` doesn't exist in
// tokens.json — see issue #11 — and silently rendered as no `color` at all,
// i.e. the browser default black, invisible against this row's near-black
// background for any non-featured, non-leader racer.)
const textColorFor = (state: RowState) => (state.featured ? "#ffffff" : state.leader ? "#ffffff" : color.base.muted);
/**
 * Background for the endcap (fast/total) cell — a deliberate break from the
 * ambient row tint, not a shared color: always noticeably brighter than
 * whatever the row itself is doing (the row carries the darker ramp step —
 * see `rowBgFor` in LeaderboardShell.tsx — so the fast/total callout pops
 * against it). P1 overall (`leader`) always gets the same green
 * (`flag.ramp[700]`, against the row's `ramp[900]`) — including when that
 * racer is ALSO featured, since holding first place is the more important
 * fact for that cell specifically (the row's ambient background still goes
 * yellow for featured regardless — see `rowBgFor` — this only reprioritizes
 * the endcap callout). A featured racer NOT currently in first still gets
 * the bright yellow (`spark.ramp[500]`).
 */
// exported so other real-row renderers (e.g. Storybook-only single-row
// sketches) can add their own endcap-shaped cells without re-deriving this
// leader/featured color rule by hand.
export const endcapBgFor = (state: RowState) =>
  state.leader
    ? color.support.flag.ramp[700]
    : state.featured
      ? color.core.spark.ramp[500]
      : MUTED_ENDCAP_BG;
// white text on the green endcap, black on the bright yellow one.
export const endcapTextFor = (state: RowState) =>
  state.leader ? "#ffffff" : state.featured ? "#000000" : MUTED_ENDCAP_TEXT;

export const nameCell = (r: { name: string; car: string }, state: RowState): Cell => ({
  padding: "18px 26px",
  content: (
    <div style={{ color: textColorFor(state), minWidth: 0 }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: 44,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "clip",
        }}
      >
        {displayName(r.name)}
      </div>
      <div style={{ fontSize: 20, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {r.car}
      </div>
    </div>
  ),
});

export const rankCell = (r: { pos: number }, state: RowState): Cell => ({
  padding: "18px 0 18px 30px",
  width: 130,
  // only "featured" inverts to a black circle — "leader" (green) keeps the
  // standard white circle/black number, same as every other row.
  content: <RankCircle pos={r.pos} diameter={68} invert={state.featured} />,
});

/** Track — rank, name/car, gap to leader. Track events run "laps", not "runs" — no runs array here. */
export const trackRowCells = (r: TrackRacer, _i: number, state: RowState): Cell[] => [
  rankCell(r, state),
  nameCell(r, state),
  {
    padding: "18px 30px",
    align: "right",
    width: 220,
    content: (
      <div style={{ fontFamily: "monospace", fontSize: 34, color: textColorFor(state) }}>{r.gap}</div>
    ),
  },
];

/**
 * Autocross — last run in-flow, fastest run flush right in its own
 * full-height cell. That cell (and the whole row) goes solid Flag green
 * (confirmation, not a mood pick, per HANDOFF.md) for whoever currently
 * holds P1 overall — regardless of whether they're "featured". Featured
 * (yellow) always wins over leader (green) if a row is somehow both.
 */
export const autocrossRowCells = (r: RankedRunRacer, _i: number, state: RowState): Cell[] => [
  rankCell(r, state),
  nameCell(r, state),
  {
    padding: "18px 30px",
    width: 220,
    content: <StatBlock label="Last" value={formatRunTime(lastOf(r.runs))} textColor={textColorFor(state)} />,
  },
  {
    padding: "0 34px",
    align: "center",
    width: 240,
    background: endcapBgFor(state),
    content: (
      <StatBlock label="Fast" value={formatRunTime(fastestOf(r.runs))} textColor={endcapTextFor(state)} />
    ),
  },
];

/**
 * Rallycross — fastest, then last, in-flow; total (cumulative across all
 * runs, the actual ranking stat) flush right in its own full-height cell.
 * Same featured (yellow) / leader (green) / normal (dark-gray endcap)
 * treatment as autocross.
 */
export const rallycrossRowCells = (r: RankedRallycrossRacer, _i: number, state: RowState): Cell[] => [
  rankCell(r, state),
  nameCell(r, state),
  {
    padding: "18px 22px",
    width: 220,
    content: (
      <StatBlock label="Fast" value={formatRunTime(fastestOf(r.runs))} textColor={textColorFor(state)} />
    ),
  },
  {
    padding: "18px 30px",
    width: 220,
    content: <StatBlock label="Last" value={formatRunTime(lastOf(r.runs))} textColor={textColorFor(state)} />,
  },
  {
    padding: "0 34px",
    align: "center",
    width: 240,
    background: endcapBgFor(state),
    content: (
      <StatBlock label="Total" value={formatRunTime(r.total)} textColor={endcapTextFor(state)} />
    ),
  },
];

/**
 * Same shape as `rallycrossRowCells`, but simplified for the run-by-run
 * recap: just this leg's run time, the TOTAL endcap, then a gap-to-leader
 * column past it at the very end of the row — in the same plain row style as
 * the run-time cell, not the endcap's bright yellow/green (that stays
 * reserved for TOTAL alone). Blank for whoever's actually leading (nothing
 * to be behind). No per-cell labels — see `rallycrossPreviousCurrentHeaderCells`
 * below, which carries RUN/TOTAL/DIFF in a header strip instead. See
 * `showPreviousCurrentRuns` in types.ts.
 */
export const rallycrossPreviousCurrentRowCells = (r: RankedRallycrossRacer, _i: number, state: RowState): Cell[] => [
  rankCell(r, state),
  nameCell(r, state),
  {
    padding: "18px 22px",
    width: 220,
    content: <StatBlock value={formatRunTime(lastOf(r.runs))} textColor={textColorFor(state)} />,
  },
  {
    padding: "0 34px",
    align: "center",
    width: 240,
    background: endcapBgFor(state),
    content: <StatBlock value={formatRunTime(r.total)} textColor={endcapTextFor(state)} />,
  },
  {
    padding: "18px 30px",
    width: 220,
    content: r.pos === 1 ? null : <StatBlock value={formatGap(r.gapToLeader)} textColor={textColorFor(state)} />,
  },
];

/**
 * The FINAL reveal for `showPreviousCurrentRuns` mode (once `throughRun` is
 * final) — fastest run of the whole event, total cones hit, total time: the
 * payoff stats once the event's actually over, not a run-to-run delta
 * (there's no "current run" once there isn't a next one). No per-cell labels
 * — see `rallycrossFinalRevealHeaderCells` below, which carries
 * FASTEST/CONES/TOTAL in a header strip instead.
 */
export const rallycrossFinalRevealCells = (r: RankedRallycrossRacer, _i: number, state: RowState): Cell[] => [
  rankCell(r, state),
  nameCell(r, state),
  {
    padding: "18px 22px",
    width: 220,
    content: <StatBlock value={formatRunTime(fastestOf(r.runs))} textColor={textColorFor(state)} />,
  },
  {
    padding: "18px 30px",
    width: 220,
    content: <StatBlock value={String(totalCones(r.cones))} textColor={textColorFor(state)} />,
  },
  {
    padding: "0 34px",
    align: "center",
    width: 240,
    background: endcapBgFor(state),
    content: <StatBlock value={formatRunTime(r.total)} textColor={endcapTextFor(state)} />,
  },
];

/**
 * Plain uppercase label, no value — one cell in the `columnHeaders` strip
 * `LeaderboardShell` renders directly below the title bar (see
 * `HEADER_ROW_HEIGHT` in layout.ts). Padding/width/align must match the
 * corresponding data cell exactly, or the header won't sit above its column.
 */
const headerCell = (label: string, width: number, padding: string, align?: Cell["align"]): Cell => ({
  width,
  padding,
  align,
  content: (
    <div
      style={{
        // same size/weight/tracking as the hero run-number text in the title
        // bar right above this strip (see `showHeroRunLabel` in
        // LeaderboardShell.tsx) — a caption-sized label read as an
        // afterthought next to the big bold numbers in the row below it.
        fontSize: 44,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
        color: "#ffffff",
        opacity: 0.6,
      }}
    >
      {label}
    </div>
  ),
});

/** blank rank/name spacers so the header strip's fixed-width cells land in
 * the same x-position as the data row's — `showRank` mirrors whichever the
 * caller passed to the row-cell renderer itself (rank cell included or not). */
const headerSpacers = (showRank: boolean): Cell[] => [
  ...(showRank ? [{ width: 130, content: null } as Cell] : []),
  { content: null },
];

/** Column headers for `rallycrossPreviousCurrentRowCells` — RUN/TOTAL/DIFF,
 * matching that row's cell order/widths/padding exactly. */
export const rallycrossPreviousCurrentHeaderCells = (showRank: boolean): Cell[] => [
  ...headerSpacers(showRank),
  headerCell("Run", 220, "18px 22px"),
  headerCell("Total", 240, "0 34px", "center"),
  headerCell("Diff", 220, "18px 30px"),
];

/** Column headers for `rallycrossFinalRevealCells` — FASTEST/CONES/TOTAL,
 * matching that row's cell order/widths/padding exactly. */
export const rallycrossFinalRevealHeaderCells = (showRank: boolean): Cell[] => [
  ...headerSpacers(showRank),
  headerCell("Fastest", 220, "18px 22px"),
  headerCell("Cones", 220, "18px 30px"),
  headerCell("Total", 240, "0 34px", "center"),
];
