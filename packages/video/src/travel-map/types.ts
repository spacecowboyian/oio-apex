/**
 * Data contract for the travel-map mileage animation (spacecowboyian/oio-apex
 * #7). A point-to-point line across the TOP of the frame: origin dot left,
 * destination dot right, both labelled beneath, mileage counting off above.
 * Transparent background, meant to composite over time-lapse/B-roll of the
 * drive to an event (the Lake Garnett pilgrimage).
 *
 * Replaced an Indiana Jones-style stylized arc through the middle of the frame.
 * Per Ian that depiction cost the centre of the shot to imply a geography
 * nobody reads off a short overlay; a straight top strip carries the same
 * information (two places, a distance) and leaves the footage alone. The open
 * art-direction questions the arc raised — real road routing, real map tiles
 * vs. an illustrated base — are moot for a straight line.
 */
export type TravelMapProps = {
  /** origin label (chip beneath the left dot) — e.g. "KC". */
  fromLabel: string;
  /** destination label (chip beneath the right dot) — e.g. "LAKE GARNETT". */
  toLabel: string;
  /** total mileage the counter ticks up to — e.g. 77 (the real KC→Lake Garnett
   * driving distance). */
  miles: number;
  /** seconds the bar takes to fill across (and the mileage to count up).
   * Caller-controlled so the overlay can be paced against whatever length of
   * B-roll it sits on. Default 3.5. */
  drawSeconds?: number;
  /** show the mileage read-out under the bar. Default true — set false when the
   * distance isn't the point and the two place names carry it alone. */
  showMileage?: boolean;
  /** seconds to hold on the completed route + final mileage. Default 1.5. */
  holdSeconds?: number;
};
