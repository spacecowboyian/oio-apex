/**
 * Data contract for the animated chapter marker — the on-screen title that
 * breaks a long-form video into sections (how-tos, build records, anything
 * with steps).
 *
 * Deliberately NOT `LowerThirdProps` with a different anchor. A lower third
 * identifies a *subject* in the frame and splits into fact/name (year+model,
 * then the car's nickname). A chapter marker names a *span of the video* and
 * splits into sequence + title. Forcing chapter data through fact/name would
 * make `fact` mean "02" in one caller and "1985 MR2" in another, and the
 * all-caps/ordering rules that make a corner label readable would stop meaning
 * anything. Same visual grammar, different contract.
 *
 * There is no `surface` and no way to turn the scrim off. A corner label takes
 * `surface` because it may sit on bare footage and has to contrast with
 * whatever is behind it; a chapter marker always draws its own scrim, so the
 * ground under it is always dark and white-on-scrim is always the answer. The
 * black-box variant was tried over bright footage and looked worse for exactly
 * that reason — it was contrasting against a darkness the marker itself had
 * just created (Ian, 2026-08-12).
 */
export type ChapterMarkerProps = {
  /** The sequence marker, rendered in the box. Numbers are padded to two
   *  digits ("2" -> "02") so a ten-chapter video keeps a consistent box width;
   *  pass a string to opt out. */
  seq: number | string;
  /** The chapter title, rendered plain beside the box. Uppercased on render. */
  title: string;
  /** Where this chapter starts, in seconds from the top of the video. Not used
   *  for rendering — it is what `buildYouTubeChapters` reads to emit the
   *  description timestamps from the same source as the on-screen marker. */
  startSeconds?: number;
  /** Frames the marker holds fully on screen before exiting. Default 3s. */
  holdSeconds?: number;
  /** px inset from the top edge. Default 64, matching the lower third's flat
   *  side inset.
   *
   *  Landscape has no platform chrome to clear (`social.safeArea.landscape.top`
   *  is 0), which is why this is a plain 64 rather than the ~400 short-form
   *  needs. But YouTube draws its own title bar and gradient across the top of
   *  the player on hover and on pause, so a marker sitting tight to the edge
   *  will be sat on intermittently. 64 clears it at 1080p; raise it if you are
   *  cutting for a player embedded at a smaller size. */
  safeInsetPx?: number;
  /** Scrim height as a % of the frame. Default 24 — correct for a marker near
   *  its anchored edge, which is what the default 64 inset gives. Not derived
   *  from `safeInsetPx`: push the marker down and re-measure a rendered frame
   *  rather than trusting this. */
  scrimHeightPct?: number;
  /** Multiplier on the hero corner-label size. Default 0.6, the same as the
   *  top-corner event/venue tags and for the same reason: a chapter title
   *  ("BLEEDING THE BRAKES") carries far more text than a fact/name pair and
   *  bleeds past the frame at hero size. */
  fontScale?: number;
};

/** One chapter in a video, for generating both the on-screen markers and the
 *  description timestamps from a single list. */
export type Chapter = ChapterMarkerProps & { startSeconds: number };
