/**
 * Data contract for the travel-map mileage animation (spacecowboyian/oio-apex
 * #7). An Indiana Jones-style route overlay: a line draws from origin to
 * destination while the mileage counts off, meant to composite over
 * time-lapse/B-roll of the drive to an event (the Lake Garnett pilgrimage).
 *
 * NOTE — open art-direction decisions carried from the issue: this is the
 * stylized-arc, transparent-overlay first cut. Whether the route follows real
 * road routing vs. a stylized arc, and whether it sits over real map tiles vs.
 * an illustrated/branded map (or just the driving footage), are still Ian's
 * calls — so this delivers the route/line/mileage layer only, over a
 * transparent background, and leaves the map base to the composite.
 */
export type TravelMapProps = {
  /** origin label (chip near the origin dot) — e.g. "KC". */
  fromLabel: string;
  /** destination label (chip near the destination dot) — e.g. "LAKE GARNETT". */
  toLabel: string;
  /** total mileage the counter ticks up to — e.g. 77 (the real KC→Lake Garnett
   * driving distance). */
  miles: number;
  /** seconds to hold on the completed route + final mileage. Default 1.5. */
  holdSeconds?: number;
};
