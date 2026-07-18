import React from "react";
import { fontStack, type } from "../theme";

export const TypeScale: React.FC = () => (
  <div style={{ background: "#000", padding: 24, color: "#e9e5de" }}>
    {Object.entries(type.scale).map(([name, size]) => (
      <div
        key={name}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          borderBottom: "1px solid #3a342c",
          padding: "12px 0",
        }}
      >
        <div style={{ flex: "0 0 90px", fontFamily: "monospace", fontSize: 11, color: "#6b6355" }}>
          {name}
        </div>
        <div style={{ fontFamily: fontStack("helvetica"), fontSize: size }}>Race Day</div>
      </div>
    ))}
  </div>
);

export const FontSuite: React.FC = () => (
  <div style={{ background: "#000", padding: 24, display: "flex", gap: 32 }}>
    {(["helvetica", "condensedBlack", "signPainter"] as const).map((key) => {
      const font = type.fonts[key];
      return (
        <div key={key} style={{ textAlign: "center", color: "#e9e5de" }}>
          <div style={{ fontFamily: fontStack(key), fontSize: 48, textTransform: "uppercase" }}>
            Oio
          </div>
          <div style={{ fontSize: 11, color: "#9a9083", marginTop: 8, maxWidth: 160 }}>
            {font.role}
          </div>
        </div>
      );
    })}
  </div>
);
