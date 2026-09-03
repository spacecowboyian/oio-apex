import React from "react";
import { fontStack, color } from "../theme";
import { formatRunTime, formatGap, totalCones } from "../leaderboard/time";
import { RallycrossRacer } from "../leaderboard/types";

/**
 * Side-by-side head-to-head comparison of two racers' run sequences and total margin.
 * Built from the same row grammar and time utilities as the leaderboard, reusing
 * `LeaderboardRow`'s visual language and `time.ts` formatting.
 *
 * Displays:
 * - Driver name and car (left/right columns)
 * - Parallel bars for each run (visual run-by-run progression)
 * - Run times (left/right aligned)
 * - Win count (runs where each driver was faster)
 * - Total margin (cumulative time difference)
 */

const SPLIT_TIME_WIDTH = 1080;
const SPLIT_TIME_HEIGHT = 300;

const HEADER_HEIGHT = 50;
const RUN_ROW_HEIGHT = 50;
const SUMMARY_HEIGHT = 60;

const DRIVER_COL_WIDTH = 240;
const BAR_COL_WIDTH = 300;
const GAP_COL_WIDTH = 140;

interface SplitTimeComparisonProps {
  driver1: RallycrossRacer;
  driver2: RallycrossRacer;
  /** Which driver to highlight (1 or 2). Omit for neutral. */
  highlight?: 1 | 2;
  /** Show as "run-by-run" (default) or "cumulative margin view". */
  viewMode?: "runs" | "margin";
}

const headerCell = (label: string) => (
  <div
    style={{
      fontSize: 24,
      fontWeight: 700,
      color: color.base.white,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
    }}
  >
    {label}
  </div>
);

const driverHeaderRow = (driver: RallycrossRacer) => (
  <div style={{ display: "flex", flexDirection: "column" as const, gap: "4px" }}>
    <div style={{ fontSize: 32, fontWeight: 700, color: color.base.white }}>
      {driver.name}
    </div>
    <div style={{ fontSize: 16, color: "rgba(255,255,255,0.8)" }}>
      {driver.car}
    </div>
  </div>
);

const timeBar = (thisRunTime: number, otherRunTime: number) => {
  const maxTime = Math.max(thisRunTime, otherRunTime);
  const thisWidth = (thisRunTime / maxTime) * 100;
  const gap = thisRunTime - otherRunTime;
  const isFaster = gap < 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
      }}
    >
      <div
        style={{
          height: "20px",
          width: `${thisWidth}%`,
          backgroundColor: isFaster ? "#4CAF50" : "#FF6B6B",
          opacity: 0.7,
          borderRadius: "3px",
        }}
      />
      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", minWidth: "40px" }}>
        {gap < 0 ? "+" : ""}
        {formatRunTime(Math.abs(gap))}
      </span>
    </div>
  );
};

const runRow = (
  run1Time: number,
  run1Cones: number,
  run2Time: number,
  run2Cones: number,
  runNumber: number,
) => {
  const diff = run1Time - run2Time;
  const driver1Faster = diff < 0;

  return (
    <div
      key={runNumber}
      style={{
        display: "flex",
        height: RUN_ROW_HEIGHT,
        width: SPLIT_TIME_WIDTH,
        fontFamily: fontStack("helvetica"),
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        alignItems: "center",
      }}
    >
      {/* Driver 1 name/car + time */}
      <div
        style={{
          width: DRIVER_COL_WIDTH,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          paddingLeft: "20px",
          fontSize: 18,
          fontWeight: 600,
          color: color.base.white,
        }}
      >
        <span>{formatRunTime(run1Time)}</span>
        {run1Cones > 0 && <span style={{ fontSize: 12, color: "rgba(255,200,0,1)" }}>+{run1Cones}</span>}
      </div>

      {/* Run-by-run bar */}
      <div
        style={{
          width: BAR_COL_WIDTH,
          paddingX: "20px",
          display: "flex",
          alignItems: "center",
        }}
      >
        {timeBar(run1Time, run2Time, true)}
      </div>

      {/* Gap indicator */}
      <div
        style={{
          width: GAP_COL_WIDTH,
          textAlign: "center" as const,
          fontSize: 20,
          fontWeight: 700,
          color: driver1Faster ? "#4CAF50" : "#FF6B6B",
        }}
      >
        {driver1Faster ? "✓" : ""}
      </div>

      {/* Driver 2 time */}
      <div
        style={{
          width: DRIVER_COL_WIDTH,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "8px",
          paddingRight: "20px",
          fontSize: 18,
          fontWeight: 600,
          color: color.base.white,
        }}
      >
        {run2Cones > 0 && <span style={{ fontSize: 12, color: "rgba(255,200,0,1)" }}>+{run2Cones}</span>}
        <span>{formatRunTime(run2Time)}</span>
      </div>
    </div>
  );
};

export const SplitTimeComparison: React.FC<SplitTimeComparisonProps> = ({
  driver1,
  driver2,
  highlight,
}) => {
  const numRuns = Math.min(driver1.runs.length, driver2.runs.length);
  const totalGap = driver1.total - driver2.total;
  const cones1 = totalCones(driver1.cones);
  const winsDriver1 = driver1.runs
    .slice(0, numRuns)
    .filter((t, i) => t < driver2.runs[i]).length;
  const winsDriver2 = numRuns - winsDriver1;

  return (
    <div
      style={{
        width: SPLIT_TIME_WIDTH,
        height: SPLIT_TIME_HEIGHT,
        background: "rgba(0,0,0,0.85)",
        fontFamily: fontStack("helvetica"),
        display: "flex",
        flexDirection: "column" as const,
        border: "2px solid " + (highlight === 1 ? "#4CAF50" : highlight === 2 ? "#FF6B6B" : "rgba(255,255,255,0.2)"),
        borderRadius: "4px",
      }}
    >
      {/* Header row with driver names */}
      <div
        style={{
          height: HEADER_HEIGHT,
          display: "flex",
          alignItems: "center",
          paddingX: "20px",
          borderBottom: "2px solid rgba(255,255,255,0.2)",
        }}
      >
        <div style={{ width: DRIVER_COL_WIDTH }}>
          {driverHeaderRow(driver1)}
        </div>
        <div style={{ flex: 1, textAlign: "center" as const }}>
          {headerCell(`${numRuns} Runs`)}
        </div>
        <div style={{ width: DRIVER_COL_WIDTH, textAlign: "right" as const }}>
          {driverHeaderRow(driver2)}
        </div>
      </div>

      {/* Run rows (vertical scroll area) */}
      <div
        style={{
          flex: 1,
          overflowY: "auto" as const,
          display: "flex",
          flexDirection: "column" as const,
        }}
      >
        {Array.from({ length: numRuns }).map((_, i) => {
          const c1 = driver1.cones ? driver1.cones[i] ?? 0 : 0;
          const c2 = driver2.cones ? driver2.cones[i] ?? 0 : 0;
          return runRow(driver1.runs[i], c1, driver2.runs[i], c2, i);
        })}
      </div>

      {/* Summary footer: win count and total margin */}
      <div
        style={{
          height: SUMMARY_HEIGHT,
          display: "flex",
          alignItems: "center",
          paddingX: "20px",
          borderTop: "2px solid rgba(255,255,255,0.2)",
          background: "rgba(0,0,0,0.5)",
          fontSize: 20,
          fontWeight: 700,
          color: color.base.white,
        }}
      >
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 24, color: "#4CAF50" }}>{winsDriver1}</span>
          <span style={{ color: "rgba(255,255,255,0.6)", marginLeft: "8px" }}>wins</span>
        </div>
        <div style={{ flex: 1, textAlign: "center" as const }}>
          <span style={{ fontSize: 28, color: totalGap < 0 ? "#4CAF50" : "#FF6B6B" }}>
            {formatGap(Math.abs(totalGap))}
          </span>
          {cones1 > 0 && (
            <div style={{ fontSize: 14, marginTop: "4px" }}>
              {driver1.name}: +{cones1} cones
            </div>
          )}
        </div>
        <div style={{ flex: 1, textAlign: "right" as const }}>
          <span style={{ fontSize: 24, color: "#FF6B6B" }}>{winsDriver2}</span>
          <span style={{ color: "rgba(255,255,255,0.6)", marginLeft: "8px" }}>wins</span>
        </div>
      </div>
    </div>
  );
};
