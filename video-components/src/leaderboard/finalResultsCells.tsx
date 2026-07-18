import { TrackRacer } from "./types";
import { RankedRunRacer, RankedRallycrossRacer } from "./runProgress";
import { StatBlock } from "./RunStats";
import { Cell, RowState } from "./LeaderboardShell";
import { fastestOf, formatRunTime } from "./time";
import { nameCell } from "./rowCells";

/**
 * Final-results table — just two columns, name/car and the one number that
 * actually matters once the event is over. No rank circle, no endcap block;
 * this is meant to sit flush against the left edge of the frame with video
 * running unobstructed behind/beside it, not to compete for attention.
 */

const textColorFor = (state: RowState) => (state.featured ? "#000000" : state.fastest ? "#ffffff" : "#e9e5de");

export const trackFinalResultCells = (r: TrackRacer, _i: number, state: RowState): Cell[] => [
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

export const autocrossFinalResultCells = (r: RankedRunRacer, _i: number, state: RowState): Cell[] => [
  nameCell(r, state),
  {
    padding: "18px 30px",
    align: "right",
    width: 220,
    content: (
      <StatBlock label="Fastest" value={formatRunTime(fastestOf(r.runs))} textColor={textColorFor(state)} />
    ),
  },
];

export const rallycrossFinalResultCells = (r: RankedRallycrossRacer, _i: number, state: RowState): Cell[] => [
  nameCell(r, state),
  {
    padding: "18px 30px",
    align: "right",
    width: 220,
    content: <StatBlock label="Total" value={formatRunTime(r.total)} textColor={textColorFor(state)} />,
  },
];
