import React from "react";
import { cornerLabel, fontStack, type } from "../theme";

export type CornerLabelProps = {
  /** left part = fact (year/make/model or event category) */
  fact: string;
  /** right part = name/sub-fact */
  name: string;
  /** which side of the frame this label is anchored to — the box always sits on the outer edge */
  anchor: "left" | "right";
  /** photo tone behind the label — drives which side gets the contrasting box */
  surface: "dark" | "light";
  /** override the fixed type-scale size (e.g. a cqw/cqh value) for frames sized independently of the rem scale */
  fontSize?: string;
  /** cap each part's width (e.g. a cqw value) and ellipsis-truncate instead of bleeding past the frame edge — only meaningful when the caller guarantees a sized container ancestor */
  maxPartWidth?: string;
};

export const CornerLabel: React.FC<CornerLabelProps> = ({ fact, name, anchor, surface, fontSize, maxPartWidth }) => {
  const palette = surface === "dark" ? cornerLabel.onDark : cornerLabel.onLight;

  const partBase: React.CSSProperties = {
    fontFamily: fontStack("helvetica"),
    fontWeight: 700,
    fontSize: fontSize ?? type.scale.h5,
    display: "inline-flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    padding: cornerLabel.partPadding,
    lineHeight: 1,
    ...(maxPartWidth
      ? { maxWidth: maxPartWidth, overflow: "hidden", textOverflow: "ellipsis", display: "inline-block" }
      : {}),
  };

  // box always sits on the outer edge: left-anchored -> box is the left (fact) part,
  // right-anchored -> box is the right (name) part.
  const factIsBoxed = anchor === "left";
  const nameIsBoxed = anchor === "right";

  const boxStyle: React.CSSProperties = {
    ...partBase,
    background: palette.boxBg,
    color: palette.boxColor,
  };
  const plainStyle: React.CSSProperties = {
    ...partBase,
    background: "transparent",
    color: palette.plainColor,
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignSelf: anchor === "left" ? "flex-start" : "flex-end",
        alignItems: "stretch",
        lineHeight: 1,
      }}
    >
      {/* ALWAYS all-caps, whatever casing the caller passes — house rule
          (Ian, 2026-07-23). See HANDOFF.md §Corner labels. */}
      <span style={factIsBoxed ? boxStyle : plainStyle}>{fact.toUpperCase()}</span>
      <span style={nameIsBoxed ? boxStyle : plainStyle}>{name.toUpperCase()}</span>
    </div>
  );
};
