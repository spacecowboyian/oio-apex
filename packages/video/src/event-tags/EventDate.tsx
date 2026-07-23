import React from "react";
import { LowerThird } from "../lower-third/LowerThird";
import { EventDateProps } from "./types";
import { formatEventDate } from "./formatEventDate";
import { TAG_FONT_SCALE, TAG_TOP_INSET_PX } from "./constants";

/**
 * Event date/time corner label (spacecowboyian/oio-apex #2). A thin preset
 * over the shared `LowerThird` corner-label engine — same box-swipe /
 * word-reveal choreography, just anchored to the TOP-RIGHT corner at the
 * smaller tag size, rather than a third fork of the same motion design.
 *
 * The mapping onto the engine's fact/name/box grammar:
 * - `anchor="right"` puts the box on the outer (right) frame edge — that's the
 *   `code` (region + discipline, `KCRX`), per Ian: "the date says enough," so
 *   no event number.
 * - the plain (unboxed) word sits inward of the box — that's the `date`,
 *   formatted `MONTH.DAY.YEAR` with a 2-digit year (`JULY.19.26`).
 * - `surface="light"` selects the black-box palette: this tag sits over the
 *   sky, not dark ground, so per the corner-label contrast rule
 *   (HANDOFF.md §Corner labels) the box must contrast as black-on-light. There
 *   is no automatic backdrop-brightness detection yet — this and the venue tag
 *   are hardcoded to the light palette, betting the location/date tags land
 *   over sky more often than not (per Ian).
 * - `scrim={false}`: no gradient — a top-corner tag over open sky doesn't get
 *   the broadcast vignette; it relies on the light-surface contrast instead.
 */
export const EventDate: React.FC<EventDateProps> = ({ code, dateISO, holdSeconds }) => (
  <LowerThird
    // fact = plain word (inward): the date. name = box (outer edge): the code.
    fact={formatEventDate(dateISO)}
    name={code}
    anchor="right"
    surface="light"
    placement="top"
    scrim={false}
    safeInsetPx={TAG_TOP_INSET_PX}
    fontScale={TAG_FONT_SCALE}
    holdSeconds={holdSeconds}
  />
);
