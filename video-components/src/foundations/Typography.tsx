import React from "react";
import { color, fontStack, type } from "../theme";

export const TypeScale: React.FC = () => (
  <div style={{ background: color.base.black, padding: 24, color: color.base.text }}>
    {Object.entries(type.scale).map(([name, size]) => (
      <div
        key={name}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          borderBottom: `1px solid ${color.base.line}`,
          padding: "12px 0",
        }}
      >
        <div style={{ flex: "0 0 90px", fontFamily: fontStack("mono"), fontSize: 11, color: color.base.muted2 }}>
          {name}
        </div>
        <div style={{ fontFamily: fontStack("helvetica"), fontSize: size }}>Race Day</div>
      </div>
    ))}
  </div>
);

export const FontSuite: React.FC = () => (
  <div style={{ background: color.base.black, padding: 24, display: "flex", gap: 32 }}>
    {(["helvetica", "condensedBlack", "signPainter"] as const).map((key) => {
      const font = type.fonts[key];
      return (
        <div key={key} style={{ textAlign: "center", color: color.base.text }}>
          <div style={{ fontFamily: fontStack(key), fontSize: 48, textTransform: "uppercase" }}>
            Oio
          </div>
          <div style={{ fontSize: 11, color: color.base.muted, marginTop: 8, maxWidth: 160 }}>
            {font.role}
          </div>
        </div>
      );
    })}
  </div>
);
