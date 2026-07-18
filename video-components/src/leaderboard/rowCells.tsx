import { color } from "../theme";
import { TrackRacer } from "./types";
import { RankedRunRacer, RankedRallycrossRacer } from "./runProgress";
import { RankCircle } from "./RankCircle";
import { StatBlock, MUTED_ENDCAP_BG, MUTED_ENDCAP_TEXT } from "./RunStats";
import { Cell, RowState } from "./LeaderboardShell";
import { fastestOf, lastOf, formatRunTime } from "./time";
import { displayName } from "./format";

// white text on both highlighted row backgrounds now that they're the darker
// ramp step (spark.ramp[700] / flag.ramp[900] — see rowBgFor); light gray otherwise.
const textColorFor = (state: RowState) => (state.featured ? "#ffffff" : state.fastest ? "#ffffff" : "#e9e5de");
/**
 * Background for the endcap (fast/total) cell — a deliberate break from the
 * ambient row tint, not a shared color: always noticeably brighter than
 * whatever the row itself is doing (the row carries the darker ramp step —
 * see `rowBgFor` in LeaderboardShell.tsx — so the fast/total callout pops
 * against it). Featured racers get the bright yellow (`spark.ramp[500]`,
 * against the row's `ramp[700]`) regardless of whether they're also
 * currently fastest — being featured always wins the endcap callout. The
 * current fastest racer, if not featured, gets the brighter green
 * (`flag.ramp[700]`, against the row's `ramp[900]`).
 */
const endcapBgFor = (state: RowState) =>
  state.featured
    ? color.core.spark.ramp[500]
    : state.fastest
      ? color.support.flag.ramp[700]
      : MUTED_ENDCAP_BG;
// black text on the bright yellow endcap, white on the still-fairly-dark green one.
const endcapTextFor = (state: RowState) =>
  state.featured ? "#000000" : state.fastest ? "#ffffff" : MUTED_ENDCAP_TEXT;

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
  // only "featured" inverts to a black circle — "fastest" (green) keeps the
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
 * holds the fastest run in the field — regardless of whether they're
 * "featured". Featured (yellow) always wins over fastest (green) if a row is
 * somehow both.
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
 * Same featured (yellow) / fastest-single-run (green) / normal (dark-gray
 * endcap) treatment as autocross.
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
