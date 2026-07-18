import React from "react";
import { color, withAlpha } from "../theme";

export const VALUE_SIZE = 38;
export const LABEL_SIZE = 20;

/** shared endcap background for non-featured rows — dark gray, white text: stands off
 * from the end of the row (a visible column break) while staying in the same dark
 * family as the row itself, rather than the light gray/black-text look this used to be. */
export const MUTED_ENDCAP_BG = withAlpha(color.base.line, 0.85);
export const MUTED_ENDCAP_TEXT = "#ffffff";

export const StatBlock: React.FC<{
  label: string;
  value: string;
  textColor: string;
}> = ({ label, value, textColor }) => (
  <div style={{ textAlign: "right" }}>
    <div
      style={{
        fontSize: LABEL_SIZE,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: textColor,
        opacity: 0.75,
      }}
    >
      {label}
    </div>
    <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: VALUE_SIZE, color: textColor }}>
      {value}
    </div>
  </div>
);
