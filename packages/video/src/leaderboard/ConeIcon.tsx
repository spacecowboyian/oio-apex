import React from "react";
import { color } from "../theme";

/** The real supplied icon (noun-safety-cone-6769739.svg), not a hand-drawn
 * approximation — monochrome, filled solid in the brand's rust color.
 * Extracted from the "#6 Run HUD" design-sketches proof-out
 * (design-sketches/BacklogSketches.stories.tsx), same as `LeaderboardRow`
 * was, so both the sketch and the real per-run cone-hit indicator
 * (rowCells.tsx's `nameCell`) render the identical glyph. */
const CONE_VIEWBOX = "-5 -10 110 135"; // native viewBox from the source SVG
const CONE_PATH =
  "m72.199 64.25 11.621 6.1602c3.0312 1.6094 3.0312 5.9297 0 7.5312l-27.828 14.75c-3.8594 2.0508-8.1211 2.0508-11.98 0l-27.828-14.75c-3.0312-1.6094-3.0312-5.9297 0-7.5312l11.621-6.1602-1.8008 6.4805c-0.71094 2.5703 0.64844 5.2617 3.1484 6.1992 12.98 4.8906 28.719 4.8906 41.699 0 2.5-0.94141 3.8594-3.6211 3.1484-6.1992l-1.8008-6.4883zm-2 10.961c1.6094-0.60938 2.4805-2.3281 2.0195-3.9805l-5.4414-19.609c-5.3711 1.4609-11.09 2.1914-16.809 2.1602-5.6992-0.019531-11.391-0.78125-16.73-2.2812l-5.4688 19.73c-0.46094 1.6602 0.41016 3.3789 2.0195 3.9805 12.559 4.7305 27.84 4.7305 40.398 0zm-36.461-25.492 4.7305-17.059c3.7305 0.69141 7.5781 1.0508 11.441 1.0703 3.9219 0.019531 7.8398-0.30859 11.648-0.98828l4.7383 17.102c-5.2188 1.4219-10.77 2.1211-16.32 2.1016-5.5312-0.019531-11.051-0.76172-16.238-2.2188zm5.2227-18.84 5.9102-21.32c0.64062-2.3086 2.7383-3.7891 5.1289-3.7891s4.4883 1.4805 5.1289 3.7891l5.9297 21.398c-3.6484 0.64062-7.4102 0.94922-11.148 0.92969-3.6797-0.019531-7.3594-0.35938-10.949-1.0117z";

export const ConeIcon: React.FC<{ size?: number }> = ({ size = 144 }) => (
  <svg width={size * (110 / 135)} height={size} viewBox={CONE_VIEWBOX}>
    <path d={CONE_PATH} fillRule="evenodd" fill={color.support.rust.ramp[500]} />
  </svg>
);
