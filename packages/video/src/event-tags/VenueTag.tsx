import React from "react";
import { LowerThird } from "../lower-third/LowerThird";
import { VenueTagProps } from "./types";
import { TAG_FONT_SCALE, TAG_TOP_INSET_PX } from "./constants";

/**
 * Venue/track tag (spacecowboyian/oio-apex #5). A thin preset over the shared
 * `LowerThird` corner-label engine — the left-anchored top-corner sibling of
 * `EventDate`, same box-swipe / word-reveal choreography, fed track/venue data.
 *
 * The mapping onto the engine's fact/name/box grammar:
 * - `anchor="left"` puts the box on the outer (left) frame edge — that's the
 *   `venue` name (`I-35 SPEEDWAY`).
 * - the plain (unboxed) word sits inward of the box — that's the `location`
 *   (`WINSTON, MISSOURI`).
 * - `surface="light"` selects the black-box palette: like the event date tag,
 *   this sits over sky, so per the corner-label contrast rule
 *   (HANDOFF.md §Corner labels) the box must contrast as black-on-light. No
 *   automatic backdrop-brightness detection yet — both top-corner tags are
 *   hardcoded to the light palette, betting they land over sky more often than
 *   not (per Ian).
 * - `scrim={false}`: no gradient — a top-corner tag over open sky relies on the
 *   light-surface contrast, not the broadcast vignette.
 */
export const VenueTag: React.FC<VenueTagProps> = ({ venue, location, holdSeconds }) => (
  <LowerThird
    // fact = box (outer/left edge): the venue. name = plain word (inward): the location.
    fact={venue}
    name={location}
    anchor="left"
    surface="light"
    placement="top"
    scrim={false}
    safeInsetPx={TAG_TOP_INSET_PX}
    fontScale={TAG_FONT_SCALE}
    holdSeconds={holdSeconds}
  />
);
