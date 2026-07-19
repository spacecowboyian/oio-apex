import React from "react";
import { color, fontStack } from "../theme";

const Swatch: React.FC<{ label: string; hex: string }> = ({ label, hex }) => (
  <div style={{ textAlign: "center", fontFamily: fontStack("helvetica") }}>
    <div style={{ height: 48, width: 96, background: hex, border: `1px solid ${color.base.line}` }} />
    <div style={{ fontSize: 11, color: color.base.muted, marginTop: 4 }}>{label}</div>
    <div style={{ fontSize: 10, color: color.base.muted2 }}>{hex}</div>
  </div>
);

const Ramp: React.FC<{ name: string; role: string; ramp: Record<string, string> }> = ({
  name,
  role,
  ramp,
}) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontFamily: fontStack("helvetica"), fontWeight: 700, fontSize: 14 }}>
      {name}
    </div>
    <div style={{ fontSize: 11, color: color.base.muted, marginBottom: 8 }}>{role}</div>
    <div style={{ display: "flex", gap: 4 }}>
      {Object.entries(ramp).map(([step, hex]) => (
        <Swatch key={step} label={step} hex={hex} />
      ))}
    </div>
  </div>
);

export const ColorRamps: React.FC = () => (
  <div style={{ background: color.base.black, padding: 24 }}>
    <Ramp name="Spark" role={color.core.spark.role} ramp={color.core.spark.ramp} />
    <Ramp name="Grit" role={color.core.grit.role} ramp={color.core.grit.ramp} />
    <Ramp name="Rust" role={color.support.rust.role} ramp={color.support.rust.ramp} />
    <Ramp name="Flag" role={color.support.flag.role} ramp={color.support.flag.ramp} />
  </div>
);
