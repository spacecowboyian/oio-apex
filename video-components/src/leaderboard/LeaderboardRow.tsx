import React from "react";
import { fontStack } from "../theme";
import { Cell, RowState, rowBgFor, rowBackgroundGradient } from "./LeaderboardShell";
import { ROW_HEIGHT } from "./layout";

/**
 * A single, real leaderboard row — the exact rendering (ambient Helvetica
 * font, per-cell background gradient, cell flex layout) `StaticFullList` and
 * any single-row use (e.g. a run HUD showing one competitor's row) share,
 * rather than each re-implementing it by hand. A first single-row sketch
 * duplicated this inline and quietly dropped the ambient font wrapper —
 * this is the fix: one definition, reused everywhere a real row is needed.
 */
export const LeaderboardRow: React.FC<{
  cells: Cell[];
  state: RowState;
  width: number;
  height?: number;
}> = ({ cells, state, width, height = ROW_HEIGHT }) => {
  const rowBg = rowBgFor(state);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        height,
        width,
        fontFamily: fontStack("helvetica"),
        background: rowBackgroundGradient(cells, width, rowBg),
      }}
    >
      {cells.map((cell, ci) => (
        <div
          key={ci}
          style={{
            ...(cell.width ? { width: cell.width, flex: `0 0 ${cell.width}px` } : { flex: "1 1 0%", minWidth: 0 }),
            display: "flex",
            alignItems: "center",
            justifyContent: cell.align === "right" ? "flex-end" : cell.align === "center" ? "center" : "flex-start",
            padding: cell.padding ?? "18px 26px",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {cell.content}
        </div>
      ))}
    </div>
  );
};
