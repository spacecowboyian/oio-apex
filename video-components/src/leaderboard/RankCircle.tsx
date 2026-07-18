import React from "react";
import { fontStack } from "../theme";

export const RankCircle: React.FC<{ pos: number; diameter: number; invert?: boolean }> = ({
  pos,
  diameter,
  invert,
}) => {
  // black-on-light reads optically smaller than white-on-dark at the same
  // geometric size (irradiation illusion) — bump the inverted (leader) circle
  // a few percent so it matches the other rows' circles visually, not just numerically.
  const size = invert ? diameter * 1.06 : diameter;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: invert ? "#000000" : "#ffffff",
        color: invert ? "#ffffff" : "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: fontStack("condensedBlack"),
        fontSize: size * 0.5,
        lineHeight: 1,
      }}
    >
      {pos}
    </div>
  );
};
