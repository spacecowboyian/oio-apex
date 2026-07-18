import React from "react";
import { color, fontStack } from "../theme";

export type BrandCircleVariant = "wordmark" | "connector" | "amp" | "num";

export type BrandCircleProps = {
  variant: BrandCircleVariant;
  children: React.ReactNode;
  /** diameter, any CSS length (px, cqw, cqh, ...) */
  diameter: string;
  /** Solid circle, always contrast-matched to what's behind it: black circle
   * + white text on light backgrounds, white circle + black text on dark
   * backgrounds. Neither is a "default" — pick whichever one contrasts.
   * `invert` selects the white-circle/black-text variant. */
  invert?: boolean;
};

// glyph size as a fraction of the diameter, and the frozen optical-centring
// offset per glyph — measured once from real Helvetica metrics, baked in as
// em ratios so they scale with the glyph. See HANDOFF.md "The circle".
const GLYPH: Record<BrandCircleVariant, { fontRatio: number; cy: string; lowercase?: boolean }> = {
  wordmark: { fontRatio: 0.36, cy: "-0.0175em" },
  connector: { fontRatio: 0.533, cy: "-0.118em", lowercase: true },
  amp: { fontRatio: 0.689, cy: "-0.0185em" },
  num: { fontRatio: 0.644, cy: "-0.0203em" },
};

/** Solid-fill brand circle — carries the OIO wordmark, a connector word, an ampersand, or a number. Never an outlined ring. */
export const BrandCircle: React.FC<BrandCircleProps> = ({ variant, children, diameter, invert = false }) => {
  const glyph = GLYPH[variant];
  return (
    <div
      style={{
        width: diameter,
        height: diameter,
        borderRadius: "50%",
        background: invert ? color.base.white : color.base.black,
        color: invert ? color.base.black : color.base.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: fontStack("helvetica"),
        fontWeight: 700,
        letterSpacing: "0.01em",
        lineHeight: 1,
        fontSize: `calc(${diameter} * ${glyph.fontRatio})`,
        textTransform: glyph.lowercase ? "lowercase" : "none",
      }}
    >
      <span style={{ display: "inline-block", transform: `translateY(${glyph.cy})` }}>{children}</span>
    </div>
  );
};
