import React from "react";
import { color, fontStack, shape } from "../theme";

const Example: React.FC<{ label: string; radius: string }> = ({ label, radius }) => (
  <div style={{ textAlign: "center", fontFamily: fontStack("helvetica") }}>
    <div
      style={{
        height: 96,
        width: 96,
        background: color.base.white,
        borderRadius: radius,
      }}
    />
    <div style={{ fontSize: 11, color: color.base.muted, marginTop: 8 }}>{label}</div>
    <div style={{ fontSize: 10, color: color.base.muted2 }}>{radius === "0" ? "radius: none" : `radius: ${radius}`}</div>
  </div>
);

export const ShapeRule: React.FC = () => (
  <div style={{ background: color.base.black, padding: 24, fontFamily: fontStack("helvetica") }}>
    <div style={{ color: color.base.white, fontSize: 14, maxWidth: 560, lineHeight: 1.5, marginBottom: 24 }}>
      {shape.rule}
    </div>
    <div style={{ display: "flex", gap: 32 }}>
      <Example label="Box, label, card, pill" radius={shape.radius.none} />
      <Example label="Badge, rank circle, connector mark" radius={shape.radius.circle} />
    </div>
  </div>
);
