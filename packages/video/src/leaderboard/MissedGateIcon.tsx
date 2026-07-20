import React from "react";
import { color } from "../theme";

/** A missed gate — driving off-course or skipping a required gate entirely,
 * a distinct mistake from clipping a cone (see `ConeIcon`). Bold red X,
 * `core.grit` (the brand's "struggle/mechanical" mood token, not
 * `support.rust` — that ramp is documented vintage/patina-only, not a mood
 * pick) — square, unlike the cone glyph's taller native aspect. */
export const MissedGateIcon: React.FC<{ size?: number }> = ({ size = 144 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <line x1="18" y1="18" x2="82" y2="82" stroke={color.core.grit.ramp[500]} strokeWidth="16" strokeLinecap="round" />
    <line x1="82" y1="18" x2="18" y2="82" stroke={color.core.grit.ramp[500]} strokeWidth="16" strokeLinecap="round" />
  </svg>
);
