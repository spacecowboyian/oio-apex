import React from "react";
import { color, fontStack, type } from "../theme";

const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

export const Swatch: React.FC<{ label: string; hex: string }> = ({ label, hex }) => (
  <div style={{ textAlign: "center", fontFamily: fontStack("helvetica") }}>
    <div style={{ height: 48, width: 96, background: hex, border: `1px solid ${color.base.line}` }} />
    <div style={{ fontSize: 11, color: color.base.muted, marginTop: 4 }}>{label}</div>
    <div style={{ fontSize: 10, color: color.base.muted2 }}>{hex}</div>
  </div>
);

export const Ramp: React.FC<{ name: string; role: string; ramp: Record<string, string> }> = ({
  name,
  role,
  ramp,
}) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontFamily: fontStack("helvetica"), fontWeight: 700, fontSize: 14, color: color.base.white }}>
      {name}
    </div>
    <div style={{ fontSize: 11, color: color.base.muted, marginBottom: 8 }}>{role}</div>
    <div style={{ display: "flex", gap: 4 }}>
      {Object.entries(ramp).map(([step, hex]) => (
        <Swatch key={step} label={step === "500" ? "500 · base" : step} hex={hex} />
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

/**
 * A named accent with its base value spelled out — the block the brand guide
 * leads each accent with. `fillText` states which text colour survives on the
 * accent used as a fill, which is a contrast fact, not a preference.
 */
export const AccentSpec: React.FC<{
  seq: string;
  name: string;
  role: string;
  ramp: Record<string, string>;
  fillText: "black" | "white";
}> = ({ seq, name, role, ramp, fillText }) => (
  <div style={{ marginBottom: 32 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
      <span
        style={{
          fontFamily: fontStack("mono"),
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          background: color.base.white,
          color: color.base.black,
          padding: "0.32em 0.55em",
        }}
      >
        {seq}
      </span>
      <span
        style={{
          fontFamily: fontStack("helvetica"),
          fontWeight: 700,
          fontSize: type.scale.h6,
          textTransform: "uppercase",
          color: color.base.white,
        }}
      >
        {name}
      </span>
      <span style={{ fontFamily: fontStack("mono"), fontSize: 11, color: color.base.muted }}>
        {ramp["500"]} · {rgb(ramp["500"])}
      </span>
    </div>
    <p
      style={{
        fontFamily: fontStack("helvetica"),
        fontSize: type.scale.body,
        lineHeight: 1.5,
        color: color.base.muted,
        maxWidth: "70ch",
        margin: "0 0 12px",
      }}
    >
      {role} Used as a fill, text on it is {fillText}.
    </p>
    <div style={{ display: "flex", gap: 4 }}>
      {Object.entries(ramp).map(([step, hex]) => (
        <Swatch key={step} label={step === "500" ? "500 · base" : step} hex={hex} />
      ))}
    </div>
  </div>
);

/**
 * A neutral with the role it can actually carry. Roles are measured and live in
 * `color.contrast`; this renders the measurement rather than a nominal label,
 * because Steel was documented as body text for months and never could carry it.
 */
export const NeutralSpec: React.FC<{ name: string; hex: string; role: string }> = ({
  name,
  hex,
  role,
}) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "12px 0", borderBottom: `1px solid ${color.base.line}` }}>
    <div
      style={{
        flex: "0 0 96px",
        height: 48,
        background: hex,
        border: `1px solid ${color.base.line}`,
      }}
    />
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: fontStack("helvetica"), fontWeight: 700, fontSize: 14, color: color.base.white }}>
        {name}{" "}
        <span style={{ fontFamily: fontStack("mono"), fontWeight: 400, fontSize: 11, color: color.base.muted }}>
          {hex}
        </span>
      </div>
      <div style={{ fontFamily: fontStack("helvetica"), fontSize: 13, lineHeight: 1.5, color: color.base.muted, maxWidth: "60ch" }}>
        {role}
      </div>
    </div>
  </div>
);

/**
 * The measured contrast table, rendered straight from `color.contrast`. What a
 * value can carry is a measurement, so this reads it rather than restating it.
 */
export const ContrastTable: React.FC = () => {
  const c = color.contrast;
  const rows: { band: string; values: string[]; rule: string }[] = [
    { band: "Body text", values: c.bodyText.pass, rule: c.bodyText.rule },
    { band: "Large text only (24px+)", values: c.largeTextOnly.values, rule: c.largeTextOnly.rule },
    { band: "Non-text", values: c.nonText.values, rule: c.nonText.rule },
  ];

  return (
    <div style={{ fontFamily: fontStack("helvetica"), color: color.base.white }}>
      <p style={{ fontSize: 13, color: color.base.muted, maxWidth: "70ch", marginTop: 0 }}>{c.note}</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
          <tbody>
            {rows.map((row) => (
              <tr key={row.band} style={{ borderBottom: `1px solid ${color.base.line}` }}>
                <td style={{ padding: "12px 16px 12px 0", verticalAlign: "top", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
                  {row.band}
                </td>
                <td style={{ padding: "12px 16px 12px 0", verticalAlign: "top" }}>
                  {row.values.map((v) => (
                    <div key={v} style={{ fontFamily: fontStack("mono"), fontSize: 11, color: color.base.muted }}>
                      {v}
                    </div>
                  ))}
                </td>
                <td style={{ padding: "12px 0", verticalAlign: "top", fontSize: 13, lineHeight: 1.5, color: color.base.muted }}>
                  {row.rule}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 13, color: color.base.muted, maxWidth: "70ch" }}>{c.accentOnDark}</p>
    </div>
  );
};
