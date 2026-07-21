import React from "react";
import { color, withAlpha } from "../theme";

export const VALUE_SIZE = 38;
export const LABEL_SIZE = 20;

/** shared endcap background for non-featured rows — dark gray, white text: stands off
 * from the end of the row (a visible column break) while staying in the same dark
 * family as the row itself, rather than the light gray/black-text look this used to be. */
export const MUTED_ENDCAP_BG = withAlpha(color.base.line, 0.85);
export const MUTED_ENDCAP_TEXT = "#ffffff";

export const StatBlock: React.FC<{
  /** omit entirely to skip the label row — e.g. a cell whose column already
   * reads clearly from context (the title bar's own "RUN N") without one. */
  label?: string;
  value: string;
  textColor: string;
  /** overrides `VALUE_SIZE` for this instance only — every existing caller
   * omits it and keeps the shared 38px scale. Meant for a caller with its
   * own tighter column-width budget (e.g. the short-form recap's asymmetric
   * safe-margin layout, see rowCells.tsx's `RECAP_VALUE_SIZE`) that needs a
   * smaller value size to make room, without shrinking every OTHER board's
   * type scale along with it. */
  valueSize?: number;
}> = ({ label, value, textColor, valueSize = VALUE_SIZE }) => (
  // `width: "fit-content"`, not just `textAlign: "right"` — this div is a
  // plain block, so absent an explicit width it fills 100% of its
  // container by default. `LeaderboardShell`'s per-cell content wrapper is
  // itself `width: "100%"` (needed so `nameCell`'s `text-overflow:
  // ellipsis` has an actual box to overflow against — see that wrapper's
  // own comment), so without this fix, THIS div would inherit that full
  // cell width and `textAlign: "right"` would right-align the value inside
  // it regardless of what the cell's own `justifyContent` (driven by
  // `Cell.align`) wanted — confirmed as a real bug: a `DIFF` column with
  // `align` left unset (meant to read as left-aligned) still visually
  // right-aligned. `fit-content` keeps this box only as wide as the wider
  // of `label`/`value` — `textAlign: "right"` still does its original job
  // of aligning a narrower label against a wider value's right edge (or
  // vice versa) WITHIN that box, it just no longer escapes the outer
  // cell's own alignment.
  <div style={{ textAlign: "right", width: "fit-content" }}>
    {label && (
      <div
        style={{
          fontSize: LABEL_SIZE,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: textColor,
          opacity: 0.75,
        }}
      >
        {label}
      </div>
    )}
    <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: valueSize, color: textColor }}>{value}</div>
  </div>
);
