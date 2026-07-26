/**
 * The parts/price-list data contract (issue #35). This is the format any
 * future ledger import — a Brains parts page, a spreadsheet, manual entry —
 * should produce: a single JSON object per project.
 *
 * The graphic is a receipt that appears SEVERAL TIMES across one video. Each
 * appearance opens at the top of the list, scrolls down through what has
 * already been bought, adds that visit's parts, and updates the total:
 * "here's where we're at, here's what we just bought, here's where we're at
 * now." `segments` is what splits the list across those visits.
 *
 * Flat top-level option fields, never nested objects — Remotion's `--props`
 * and the Studio props panel shallow-merge over `defaultProps` at the TOP
 * LEVEL ONLY, so a nested `{width, height}` risks a half-applied merge. Same
 * gotcha the leaderboard's `title`/`frameWidth` fields already document.
 */

export type Orientation = "landscape" | "portrait";

export type PartLine = {
  /** Short, on-screen name. Ledger names are usually descriptive prose ("2.5\"
   * stainless exhaust bend kit (8-piece: straights & U-bends)") — shorten for
   * screen and leave the full text in the ledger. */
  part: string;
  /** Optional supplier, rendered small beside the name. Omit (or "") when the
   * ledger genuinely doesn't record one — better a blank than an invented
   * vendor. */
  vendor?: string;
  /**
   * Raw number, never a pre-formatted string — the component owns the currency
   * mark, the thousands separators and the cents, exactly as `RunRacer.runs`
   * is raw seconds and the leaderboard owns `M:SS.mmm`. Two callers formatting
   * money two ways is the drift this prevents.
   */
  price: number;
  /**
   * Marks a price that is an estimate rather than a receipt, and renders it
   * with a leading `≈`. Real ledgers carry these (the Nessie exhaust list has
   * an "~$15 in misc. adapters from O'Reilly" line) and a graphic that shows
   * them as exact overstates its own precision.
   */
  est?: boolean;
};

export type PartsListConfig = {
  /** Project label. Not currently drawn on the sheet — the receipt opens
   * straight on the item table, per Ian 2026-07-26 — but kept because every
   * export needs a filename and the render queue slugifies this. */
  title?: string | null;
  /** Every part, in the order they were bought. Order drives both the printed
   * list and which parts belong to which appearance. */
  items: PartLine[];
  /**
   * How many parts each appearance ADDS, in order. `[5, 2, 2, 2]` means the
   * graphic shows up four times, first printing five lines, then two, then
   * two, then two. Must sum to `items.length` or less; a shorter sum simply
   * leaves the tail unprinted (a project still in progress).
   *
   * Not a constant and not derived — what gets added between two appearances
   * is whatever was bought between two shoots, so it is data.
   */
  segments: number[];
  /**
   * The target to track against, raw number. Optional: with no budget the
   * sheet still totals, it just has nothing to compare against and the
   * budget block doesn't render.
   */
  budget?: number | null;
  /**
   * Which appearance to render. `0`-based index into `segments`, or `"recap"`
   * for the closing pass that tallies the finished list. Each appearance is
   * its own clip — the video cuts away between them — which is why this is a
   * render-time selector rather than one long composition.
   */
  appearance?: number | "recap" | null;
  /** `"landscape"` hangs the sheet off the frame's top edge beside footage;
   * `"portrait"` sits it in the upper band of a vertical frame with the lower
   * half free. Defaults `"landscape"`. */
  orientation?: Orientation | null;
  /** Target frame size. Defaults to 1920x1080 landscape / 1080x1920 portrait.
   * Flat fields for the shallow-merge reason above. */
  frameWidth?: number | null;
  frameHeight?: number | null;
  /**
   * Caps how many rows the window shows, BELOW whatever the frame could fit.
   * Portrait defaults to 5 (see `MAX_ROWS` in layout.ts) so a vertical cut
   * keeps its lower half free for whatever else is running there; landscape
   * defaults uncapped and takes whatever the frame allows. A list longer than
   * the window scrolls — type never compresses, because a part name is either
   * readable at frame scale or it isn't.
   */
  maxRows?: number | null;
  /** Seconds a newly-arrived line stays enlarged before settling into the
   * column. Defaults 1.5. */
  emphasisSeconds?: number | null;
  /** Whether the sheet slides/fades out at the end of its clip. Defaults
   * `false` — these are cut between in the edit, so a built-in exit mostly
   * gets in the way. */
  animateOut?: boolean | null;
};
