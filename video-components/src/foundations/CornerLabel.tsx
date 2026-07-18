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
};

const partBase: React.CSSProperties = {
  fontFamily: fontStack("helvetica"),
  fontWeight: 700,
  fontSize: type.scale.h5,
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  padding: cornerLabel.partPadding,
  lineHeight: 1,
};

export const CornerLabel: React.FC<CornerLabelProps> = ({ fact, name, anchor, surface }) => {
  const palette = surface === "dark" ? cornerLabel.onDark : cornerLabel.onLight;

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
      <span style={factIsBoxed ? boxStyle : plainStyle}>{fact}</span>
      <span style={nameIsBoxed ? boxStyle : plainStyle}>{name}</span>
    </div>
  );
};
