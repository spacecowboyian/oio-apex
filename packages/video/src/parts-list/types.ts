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
  /**
   * The second in the clip this line lands on. Set it and the row arrives on
   * that mark instead of on the uniform `partBeatSeconds` metronome — which is
   * what cutting the receipt to narration needs, since speech is not evenly
   * spaced. Leave it off and the part falls back to the beat, so a list can be
   * dialed in one line at a time.
   *
   * It lives ON THE ITEM rather than in a parallel array of times because this
   * is the field that gets adjusted by hand against a video: a separate array
   * has to be counted into position, and a mis-counted entry silently syncs the
   * wrong part. Here the part and its mark are read and edited together.
   *
   * Timings belong to one telling of the ledger, not to the parts, so a ledger
   * cut to narration is its OWN dataset file (see
   * `nessie-exhaust-readthrough.json`) rather than marks added to the canonical
   * one.
   */
  at?: number | null;
  /**
   * The second this line is struck off: crossed out on the sheet and taken back
   * out of the total. For the wrong part, the part that was superseded, the one
   * that got returned — the money was still spent at the time, so the line
   * stays on the receipt rather than disappearing, which is how a real receipt
   * handles it and how the video can talk about it.
   *
   * Independent of `at`: a line lands, sits there for as long as the story
   * needs, and is struck later in the same clip.
   */
  voidedAt?: number | null;
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
   * Which side of the frame the sheet hangs on. Defaults `"left"`. The margin
   * is the same either way — `"right"` mirrors the sheet's own left offset to
   * the opposite edge — so the graphic sits the same distance off the frame
   * regardless of which side the subject is on. Set it to whichever side the
   * footage leaves empty; a talking head on the left wants the receipt right.
   */
  side?: "left" | "right" | null;
  /**
   * Caps how many rows the window shows, BELOW whatever the frame could fit.
   * Portrait defaults to 5 (see `MAX_ROWS` in layout.ts) so a vertical cut
   * keeps its lower half free for whatever else is running there; landscape
   * defaults uncapped and takes whatever the frame allows. A list longer than
   * the window scrolls — type never compresses, because a part name is either
   * readable at frame scale or it isn't.
   */
  maxRows?: number | null;
  /** Seconds held after the LAST part of this appearance lands, before the
   * closing beat. Defaults 1.5. */
  emphasisSeconds?: number | null;
  /**
   * Seconds between one part landing and the next, within a single appearance.
   * Parts always arrive one at a time — this is the room left to SPEAK to each
   * one before the next shows up (Ian 2026-07-27), so it is the field to raise
   * when a part needs a longer story, and it sets the clip's length: an
   * appearance adding `n` parts runs roughly `n × partBeatSeconds` plus the
   * open and close beats. Defaults 2.4.
   */
  partBeatSeconds?: number | null;
  /**
   * Force the clip's length in seconds, instead of deriving it from the last
   * part plus the closing beats. For a receipt cut to narration this is the
   * source clip's own duration, so the render lines up 1:1 with the footage it
   * overlays.
   */
  durationSeconds?: number | null;
  /** Whether the sheet slides/fades out at the end of its clip. Defaults
   * `false` — these are cut between in the edit, so a built-in exit mostly
   * gets in the way. */
  animateOut?: boolean | null;
};
