import React from "react";
import { color } from "../theme";

const Swatch: React.FC<{ label: string; hex: string }> = ({ label, hex }) => (
  <div style={{ textAlign: "center", fontFamily: "Helvetica, Arial, sans-serif" }}>
    <div style={{ height: 48, width: 96, background: hex, border: "1px solid #3a342c" }} />
    <div style={{ fontSize: 11, color: "#9a9083", marginTop: 4 }}>{label}</div>
    <div style={{ fontSize: 10, color: "#6b6355" }}>{hex}</div>
  </div>
);

const Ramp: React.FC<{ name: string; role: string; ramp: Record<string, string> }> = ({
  name,
  role,
  ramp,
}) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 14 }}>
      {name}
    </div>
    <div style={{ fontSize: 11, color: "#9a9083", marginBottom: 8 }}>{role}</div>
    <div style={{ display: "flex", gap: 4 }}>
      {Object.entries(ramp).map(([step, hex]) => (
        <Swatch key={step} label={step} hex={hex} />
      ))}
    </div>
  </div>
);

export const ColorRamps: React.FC = () => (
  <div style={{ background: "#000", padding: 24 }}>
    <Ramp name="Spark" role={color.core.spark.role} ramp={color.core.spark.ramp} />
    <Ramp name="Grit" role={color.core.grit.role} ramp={color.core.grit.ramp} />
    <Ramp name="Rust" role={color.support.rust.role} ramp={color.support.rust.ramp} />
    <Ramp name="Flag" role={color.support.flag.role} ramp={color.support.flag.ramp} />
  </div>
);
