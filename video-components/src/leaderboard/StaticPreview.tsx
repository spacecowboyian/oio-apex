import React from "react";
import { fontStack } from "../theme";
import { LeaderboardConfig } from "./types";
import { deriveStandings } from "./runProgress";
import { trackRowCells, autocrossRowCells, rallycrossRowCells } from "./rowCells";
import { RowState } from "./LeaderboardShell";
import { LeaderboardRow } from "./LeaderboardRow";
import { TITLE_HEIGHT, WIDTH_FOR_EVENT } from "./layout";

/**
 * A plain, complete, non-animated rendering of every racer in final
 * standing order — no camera, no scroll clipping, no position-change
 * sequence. Storybook-only: this is for reviewing the full data set at a
 * glance (the real component always clips/scrolls once a roster is too
 * tall for the frame, which is correct for video output but unhelpful when
 * you just want to eyeball every row). Reuses the same row-cell renderers
 * and color rules as `LeaderboardShell` so it stays visually identical, not
 * a re-styled approximation.
 */
export const StaticFullList: React.FC<{ config: LeaderboardConfig }> = ({ config: rawConfig }) => {
  const config = deriveStandings(rawConfig);
  const { title, highlightMode, featured } = config;
  const featuredNames = highlightMode === "manual" ? featured ?? [] : [];
  const isFeatured = (row: { pos: number; name: string }) =>
    highlightMode === "leader" ? row.pos === 1 : featuredNames.includes(row.name);

  const width = WIDTH_FOR_EVENT[config.eventType];
  const renderCells =
    config.eventType === "track"
      ? trackRowCells
      : config.eventType === "autocross"
        ? autocrossRowCells
        : rallycrossRowCells;
  const racers = config.racers as Array<{ pos: number; name: string }>;

  return (
    <div style={{ width, fontFamily: fontStack("helvetica"), background: "rgba(0,0,0,0.82)" }}>
      {title && (
        <div
          style={{
            height: TITLE_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#000000",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "0 30px",
          }}
        >
          <span>{title}</span>
        </div>
      )}
      {racers.map((row, i) => {
        const state: RowState = { featured: isFeatured(row), leader: row.pos === 1 };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cells = (renderCells as any)(row, i, state);
        return <LeaderboardRow key={row.pos} cells={cells} state={state} width={width} />;
      })}
    </div>
  );
};
