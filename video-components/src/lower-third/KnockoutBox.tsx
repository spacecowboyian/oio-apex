import React, { useId } from "react";
import { measureTextWidth } from "./measureText";

export type KnockoutBoxProps = {
  text: string;
  /** solid fill of the box itself — the text is a true cutout of this fill, not a colored glyph */
  boxBg: string;
  fontFamily: string;
  fontSizePx: number;
  /** 0.32em/0.55em per the corner-label token — passed pre-multiplied to px */
  paddingYPx: number;
  paddingXPx: number;
};

/**
 * The boxed half of a corner label, rendered so its text is a literal alpha
 * hole (an SVG mask), not colored glyphs — the real backdrop this composition
 * gets laid over shows through the letters. Sized from canvas-measured text
 * width so the box always fits its content exactly, at any fact/name length.
 */
export const KnockoutBox: React.FC<KnockoutBoxProps> = ({
  text,
  boxBg,
  fontFamily,
  fontSizePx,
  paddingYPx,
  paddingXPx,
}) => {
  const maskId = useId();
  const textWidth = measureTextWidth(text, 700, fontFamily, fontSizePx);
  const width = Math.ceil(textWidth + paddingXPx * 2);
  const height = Math.ceil(fontSizePx + paddingYPx * 2);

  return (
    <svg width={width} height={height} style={{ display: "block", flexShrink: 0 }}>
      <mask id={maskId}>
        <rect width={width} height={height} fill="white" />
        <text
          x={paddingXPx}
          y={height / 2}
          dominantBaseline="central"
          textAnchor="start"
          fontFamily={fontFamily}
          fontWeight={700}
          fontSize={fontSizePx}
          fill="black"
        >
          {text}
        </text>
      </mask>
      <rect width={width} height={height} fill={boxBg} mask={`url(#${maskId})`} />
    </svg>
  );
};
