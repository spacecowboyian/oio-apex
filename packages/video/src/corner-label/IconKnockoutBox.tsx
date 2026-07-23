import React, { useId } from "react";

export type IconKnockoutBoxProps = {
  /** SVG "ink" to cut out of the box, authored in a stable 0–24 coordinate box
   * (see the glyphs module). Built from layered solid fills — paint a shape,
   * then punch a smaller same-shape in the opposite color on top — not thin
   * strokes, which read fuzzy/broken in a luminance mask. */
  glyph: React.ReactNode;
  /** solid fill of the box itself — the glyph is a true cutout of this fill,
   * not a colored icon (a flat colored icon was tried and rejected). */
  boxBg: string;
  fontSizePx: number;
  /** 0.32em vertical padding per the corner-label token, passed pre-multiplied
   * to px — the box is square, sized to the glyph's cap-height-equivalent. */
  paddingYPx: number;
};

/**
 * The icon variant of a corner-label box (spacecowboyian/oio-apex #1/#3): a
 * square knockout box whose glyph is a literal alpha hole (an SVG mask), the
 * same true-knockout technique as the text `KnockoutBox` so the real backdrop
 * shows through the icon. Fixed `viewBox="0 0 24 24"` regardless of the box's
 * pixel size, so every glyph is defined in stable 0–24 coordinates and can't
 * drift out of proportion against a differently-sized box.
 */
export const IconKnockoutBox: React.FC<IconKnockoutBoxProps> = ({ glyph, boxBg, fontSizePx, paddingYPx }) => {
  const maskId = useId();
  const size = Math.ceil(fontSizePx + paddingYPx * 2);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}>
      <mask id={maskId}>
        <rect x="0" y="0" width="24" height="24" fill="white" />
        {glyph}
      </mask>
      <rect x="0" y="0" width="24" height="24" fill={boxBg} mask={`url(#${maskId})`} />
    </svg>
  );
};
