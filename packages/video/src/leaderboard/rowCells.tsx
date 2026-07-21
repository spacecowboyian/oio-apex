import type { ReactNode } from "react";
import { color, fontStack } from "../theme";
import { TrackRacer } from "./types";
import { RankedRunRacer, RankedRallycrossRacer } from "./runProgress";
import { RankCircle } from "./RankCircle";
import { StatBlock, MUTED_ENDCAP_BG, MUTED_ENDCAP_TEXT, VALUE_SIZE } from "./RunStats";
import { Cell, RowState } from "./LeaderboardShell";
import { fastestOf, lastOf, formatGap, totalCones, totalMissedGates, formatRunTime } from "./time";
import { displayName } from "./format";
import { ConeIcon } from "./ConeIcon";
import { MissedGateIcon } from "./MissedGateIcon";

/**
 * A smaller `StatBlock`/header value size used ONLY by the short-form
 * recap's TIME/TOTAL/DIFF/PENALTY cells (`rallycrossPreviousCurrentRowCells`/
 * `rallycrossFinalRevealCells` and their matching header-cell builders
 * below) — every other board (track/autocross/rallycross's plain row
 * cells) keeps the shared `VALUE_SIZE` (38) untouched. Exists to free up
 * horizontal room for the asymmetric safe-margin layout: real platform
 * safe-zone guidance (YouTube Shorts/TikTok/Reels) reports a right-side
 * keep-clear zone of ~120-150px — much bigger than a symmetric guess can
 * afford without either clipping the name column or the DIFF column's
 * widest values ("+12.153"-style double-digit gaps). Shrinking JUST this
 * recap's numeral scale (not its column count, not the name scale)
 * reclaims exactly the width that safe margin needs.
 */
const RECAP_VALUE_SIZE = 36;

/** Icon sizing for `penaltyCell`'s cone/missed-gate badges — a count (always
 * shown, even at 1) plus one icon, not N repeated icons, so the footprint
 * stays fixed and small no matter how high the count gets. The two halves
 * of this badge deliberately use TWO DIFFERENT scales, not one shared one:
 * the count digit (in `penaltyBadge` below) matches `RECAP_VALUE_SIZE` —
 * the same scale as the TIME/TOTAL/DIFF cells right next to it — but the
 * cone/missed-gate icon stays keyed off the larger, original `VALUE_SIZE`
 * (38), per Ian's call that the icon itself should stay at its original
 * bigger size even though the digit beside it shrank. `ConeIcon`'s source
 * SVG carries built-in padding in its viewBox (`-5 -10 110 135` — the drawn
 * cone doesn't fill that box), so setting its `size` prop equal to a font
 * size renders a visibly SMALLER glyph than text at that same nominal size
 * — measured at ~28px (digit) vs. ~24px (cone) tall on screen when both
 * were nominally 38px. `CONE_MATCH_SCALE` (28/24) is the factor that makes
 * the two actually read as the same height at a given nominal size;
 * `CONE_EMPHASIS_SCALE` pushes past that on top, per Ian's separate call
 * that even a height-matched cone still read too small — the icon is meant
 * to be the louder element of the badge, not an afterthought beside the
 * count. `MISSED_GATE_SIZE` stays proportionally smaller than the cone —
 * the X's square bounding box reads bigger than the cone's narrower
 * silhouette at the same nominal size. */
const CONE_MATCH_SCALE = 28 / 24;
const CONE_EMPHASIS_SCALE = 1.4;
const PENALTY_CONE_SIZE = Math.round(VALUE_SIZE * CONE_MATCH_SCALE * CONE_EMPHASIS_SCALE);
const PENALTY_MISSED_GATE_SIZE = Math.round(PENALTY_CONE_SIZE * (26 / 36));
/** Same idea as `RECAP_VALUE_SIZE`, for the name column. Originally bumped
 * on the theory that an iPhone 16 Pro's screen (2622x1206, taller/narrower
 * than 9:16) would crop ~98px off each side of a fullscreen 1080-wide
 * master via aspect-ratio "cover" scaling — that theory turned out to be
 * WRONG for the real player: a real screenshot Ian sent (see
 * `ShortFormDeviceCrop`'s own doc comment) showed zero horizontal crop,
 * the player scales to fit device WIDTH exactly instead. `leftSafeMargin`/
 * `rightSafeMargin` were left as-is rather than walked back down, since
 * they're independently justified by plain UI-overlay safe-zone guidance
 * (the like/comment/share button rail, search/back icons — see
 * `types.ts`), just not by the device-crop math that originally motivated
 * the bump. This name-column type scale reduction is what made room for
 * that bump either way, so it stays. */
const RECAP_NAME_SIZE = 34;
const RECAP_CAR_SIZE = 16;
/** Per Ian: every interior short-form recap cell (Driver/Name, TIME, TOTAL,
 * DIFF — NOT the PENALTY cone/gate column, which keeps its own tight
 * near-zero padding so it still reads as merged with TOTAL right beside
 * it) now shares this one horizontal padding, instead of each column
 * carrying its own hand-tuned left/right numbers. That per-column tuning
 * predates `recapColumnWidths` (rowCells.tsx) actually measuring and
 * budgeting real column widths — with real measurement doing the fitting
 * work now, the asymmetric paddings were leftover scaffolding, not a
 * requirement. The row's true ends (column 0 / the last column) still get
 * the extra safe-margin inset on top of this — see `LeaderboardShell`'s
 * `edgeInset` — so this is only the shared BASE padding, not the final
 * padding at the row's outer edges. */
const RECAP_CELL_PADDING = "18px 20px";
const RECAP_NAME_PADDING = RECAP_CELL_PADDING;
/** Per Ian: no adaptive shrinking for long names — `RECAP_NAME_SIZE` stays
 * fixed regardless of length. An earlier pass here scaled the name (and car
 * subtitle) down for anything past 8 characters, reasoning that a smaller
 * full word beat a truncated one; Ian's call was the opposite — a
 * consistently-sized "CHRISTOP…" reads better than the same name rendered
 * noticeably smaller than everyone else's. `nameCell`'s `textOverflow:
 * ellipsis` (plus the `minWidth: 0` fix in `LeaderboardShell.tsx` that
 * makes it actually work) is the ONLY thing handling overflow now — no
 * length-based sizing function feeding it. */
const PENALTY_ICON_GAP = 2;
// no header label to accommodate (see penaltyHeaderSpacer below) — sized
// just for the data content (one icon + a short count), so the name column
// keeps as much room as possible. Narrow enough that, combined with the
// near-zero left padding below, the right-aligned badge sits right up
// against the TOTAL column — the two read as one merged block — while the
// right padding still keeps a clean gap before DIFF. 83, not 92 — halved
// horizontal padding (see `RECAP_NAME_PADDING`'s comment) means this box
// needs 9px less width to hold the exact same content at the exact same
// margin, and that 9px flows to the name column instead.
const PENALTY_CELL_WIDTH = 95;

const RECAP_BASE_TIME_WIDTH = 165;
const RECAP_BASE_TOTAL_WIDTH = 216;
const RECAP_BASE_DIFF_WIDTH = 220;
// the name column's CEILING, not a floor — per Ian, the column should only
// ever be as wide as the longest actual name needs (so a roster of short
// names, "IAN"/"RYAN", gets a narrow column with no dead space), but never
// wider than this cap even if the roster has a much longer name (that name
// ellipsizes instead — see `RECAP_NAME_SIZE`'s "no adaptive shrinking"
// comment, this is the same tradeoff one level up: fixed cap, not a
// fixed size). Measured (not guessed) as 8 "M"s — the widest realistic
// letter, so this is a true worst-case cap — at `RECAP_NAME_SIZE`.
const RECAP_NAME_MAX_CHARS = 8;

// real canvas text measurement (Remotion renders this in an actual browser,
// not an SSR guess) — a per-character ratio guess got the row-cell padding
// wrong more than once already this project (see `RECAP_NAME_PADDING`'s own
// history), so this recap's "how wide does this exact string render" work
// uses the browser's own metrics instead. Falls back to a rough per-char
// estimate only in a non-DOM context (e.g. a unit test), where a canvas
// isn't available at all.
const measureCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
const measureCtx = measureCanvas?.getContext("2d") ?? null;
const measureTextWidth = (text: string, size: number, weight = 700): number => {
  if (!measureCtx) return text.length * size * 0.62;
  measureCtx.font = `${weight} ${size}px ${fontStack("helvetica")}`;
  return measureCtx.measureText(text).width;
};

/**
 * Per-render column widths for the short-form recap's Driver/Time/Total/
 * Diff columns. Per Ian: the name column used to be a flex-fill slot — it
 * claimed all the row's leftover width regardless of how short the actual
 * names were, so a roster of short names ("IAN", "RYAN") left a big dead
 * gap between the name text and the TIME column that started. This instead
 * sizes the name column to the WIDEST actual name in the current roster
 * (measured, not estimated — see `measureTextWidth`), and hands whatever
 * pixels that frees up back to TIME/TOTAL/DIFF (split evenly, remainder to
 * DIFF) instead of leaving it empty. `racerNames` should be the full roster
 * for the event, not just the current leg's snapshot — the column widths
 * must stay constant across every leg of the recap, or the header row
 * (drawn once) would drift out of alignment with whichever leg is on
 * screen. `leftSafeMargin` matters here too: when `showRank` is off, the
 * name cell (not the rank circle) becomes column 0, and `LeaderboardShell`'s
 * `edgeInset` pads column 0 by the full safe margin ON TOP of the name
 * cell's own padding — a real bug found by rendering this: with the margin
 * left out of this math, short names ("IAN", "LARRY") were measured against
 * the wrong (too-generous) content width and then clipped to a single
 * letter once the safe-margin padding actually landed.
 */
const recapColumnWidths = (
  racerNames: string[],
  boardWidth: number,
  showRank: boolean,
  leftSafeMargin: number = 0,
) => {
  const rankWidth = showRank ? 130 : 0;
  const fixedSum = rankWidth + RECAP_BASE_TIME_WIDTH + RECAP_BASE_TOTAL_WIDTH + PENALTY_CELL_WIDTH + RECAP_BASE_DIFF_WIDTH;
  // `RECAP_CELL_PADDING`'s two horizontal 20px sides, plus the safe-margin
  // inset `edgeInset` adds when this cell lands at column 0 (see above).
  const namePaddingH = 20 * 2 + (showRank ? 0 : leftSafeMargin);
  const nameMaxWidth = Math.ceil(measureTextWidth("M".repeat(RECAP_NAME_MAX_CHARS), RECAP_NAME_SIZE)) + namePaddingH;
  const availableForName = Math.max(nameMaxWidth, boardWidth - fixedSum);
  const widestName = Math.max(
    // the "Driver" header label itself (RECAP_VALUE_SIZE, not RECAP_NAME_SIZE
    // — it's a `headerCell`, not a `nameCell`) must fit the same column too.
    measureTextWidth("DRIVER", RECAP_VALUE_SIZE),
    ...racerNames.map((n) => measureTextWidth(displayName(n).toUpperCase(), RECAP_NAME_SIZE)),
  );
  // sized to the longest ACTUAL name, capped at `nameMaxWidth` (8 chars'
  // worth) — never wider than that even if a real name is longer (it
  // ellipsizes instead), never wider than `widestName` needs either (a
  // roster of short names gets a genuinely narrow column, not an 8-char-wide
  // one sitting mostly empty).
  const nameWidth = Math.min(availableForName, nameMaxWidth, Math.ceil(widestName) + namePaddingH);
  // freed space splits evenly across TIME/TOTAL/DIFF — per Ian, the extra
  // breathing room on TIME's right side (it reads as a fatter gap before
  // TOTAL starts, even though TIME's own "SS.mmm" content never needs the
  // room) is the look he wants, not a bug to squeeze back out. `diffPadding`
  // below gives DIFF's LEFT side that same fat gap on purpose, so the
  // Total/Penalty -> Diff boundary reads with the same breathing room as
  // the Time -> Total one, instead of DIFF's shared `RECAP_CELL_PADDING`
  // looking tight by comparison right next to it.
  const freed = Math.max(0, availableForName - nameWidth);
  const extraEach = Math.floor(freed / 3);
  const diffPadding = `18px 20px 18px ${20 + extraEach}px`;
  return {
    nameWidth,
    timeWidth: RECAP_BASE_TIME_WIDTH + extraEach,
    totalWidth: RECAP_BASE_TOTAL_WIDTH + extraEach,
    diffWidth: RECAP_BASE_DIFF_WIDTH + (freed - extraEach * 2),
    diffPadding,
  };
};

// white text on both highlighted row backgrounds now that they're the darker
// ramp step (spark.ramp[700] / flag.ramp[900] — see rowBgFor); light gray otherwise.
// (`color.base.muted` — a real token; `color.base.text` doesn't exist in
// tokens.json — see issue #11 — and silently rendered as no `color` at all,
// i.e. the browser default black, invisible against this row's near-black
// background for any non-featured, non-leader racer. Confirmed as a
// pre-existing bug, not something this recap feature introduced: even
// `autocross-position-change.json`, a config that predates issue #13
// entirely, renders bystander rows in barely-legible black-on-black without
// this fix — verified by diffing an actual render against the pre-#13
// baseline commit, not by eye; a first pass at this same check misjudged
// the baseline screenshot's black text as white at a glance.)
const textColorFor = (state: RowState) => (state.featured ? "#ffffff" : state.leader ? "#ffffff" : color.base.muted);
/**
 * Background for the endcap (fast/total) cell — a deliberate break from the
 * ambient row tint, not a shared color: always noticeably brighter than
 * whatever the row itself is doing (the row carries the darker ramp step —
 * see `rowBgFor` in LeaderboardShell.tsx — so the fast/total callout pops
 * against it). P1 overall (`leader`) always gets the same green
 * (`flag.ramp[700]`, against the row's `ramp[900]`) — including when that
 * racer is ALSO featured, since holding first place is the more important
 * fact for that cell specifically (the row's ambient background still goes
 * yellow for featured regardless — see `rowBgFor` — this only reprioritizes
 * the endcap callout). A featured racer NOT currently in first still gets
 * the bright yellow (`spark.ramp[500]`) — unless `showFeaturedRowHighlight`
 * is `false` (default `true`, matching every existing caller), in which
 * case the endcap falls back to the same muted treatment as a bystander's,
 * matching `rowBgFor`'s own flag.
 */
// exported so other real-row renderers (e.g. Storybook-only single-row
// sketches) can add their own endcap-shaped cells without re-deriving this
// leader/featured color rule by hand.
export const endcapBgFor = (state: RowState, showFeaturedRowHighlight: boolean = true) =>
  state.leader
    ? color.support.flag.ramp[700]
    : state.featured && showFeaturedRowHighlight
      ? color.core.spark.ramp[500]
      : MUTED_ENDCAP_BG;
// white text on the green endcap, black on the bright yellow one.
export const endcapTextFor = (state: RowState, showFeaturedRowHighlight: boolean = true) =>
  state.leader ? "#ffffff" : state.featured && showFeaturedRowHighlight ? "#000000" : MUTED_ENDCAP_TEXT;
/** Knocks back a bystander row's endcap content (TOTAL value, PENALTY cone/
 * count) to the same 0.75 opacity `nameCell`'s own car-subtitle text uses —
 * `MUTED_ENDCAP_TEXT` is plain white, not `color.base.muted`, so without
 * this the endcap read brighter/louder than the rest of a bystander's own
 * (actually-muted) row instead of receding with it. Mirrors `textColorFor`'s
 * OWN condition (`featured || leader`, ignoring `showFeaturedRowHighlight`)
 * rather than `endcapBgFor`/`endcapTextFor`'s — those two gate the endcap's
 * green/yellow HIGHLIGHT box on `showFeaturedRowHighlight` (a separate
 * concern), but a featured racer's NAME stays white regardless of that flag
 * (configs like the short-form recap turn it off deliberately), so gating
 * opacity the same way would dim a featured row's endcap out of sync with
 * its own still-bright name column — exactly the mismatch this exists to
 * avoid. */
export const endcapOpacityFor = (state: RowState) => (state.featured || state.leader ? 1 : 0.75);

/**
 * `nameSize`/`carSize` default to the shared 44/20 every standard board
 * uses — only the short-form recap (tight on width from its asymmetric
 * safe margins, see `RECAP_VALUE_SIZE`) overrides them, via
 * `RECAP_NAME_SIZE`/`RECAP_CAR_SIZE` below. Every other caller is
 * unaffected. `padding` likewise defaults to the shared "18px 26px" every
 * standard board keeps — the short-form recap passes `RECAP_NAME_PADDING`
 * (half the horizontal component) to squeeze a few more real characters in
 * before the ellipsis fallback has to kick in.
 */
export const nameCell = (
  r: { name: string; car: string },
  state: RowState,
  nameSize: number = 44,
  carSize: number = 20,
  padding: string = "18px 26px",
  // per Ian: the short-form recap drops the car subtitle entirely — at
  // `RECAP_CAR_SIZE` it read as too tiny to matter. Every other board keeps
  // it (default true).
  showCar: boolean = true,
  // explicit pixel width, measured per-render from the actual roster (see
  // `recapColumnWidths` below) — short-form recap only. Every other board
  // omits this and keeps the old flex-fill behavior (undefined -> `Cell`
  // has no `width`, so `LeaderboardShell` gives it `flex: 1 1 0%`).
  width?: number,
): Cell => ({
  padding,
  ...(width !== undefined ? { width } : {}),
  content: (
    // `width: "100%"` on both this wrapper and the two text lines below is
    // load-bearing, not decorative: `text-overflow: ellipsis` only engages
    // on an element that has its OWN bounded width to overflow against. Left
    // implicit (shrink-to-fit, the block-level default), the name/car divs
    // never overflow themselves — the actual clip happens one level up, at
    // `LeaderboardShell`'s flex-cell `overflow: hidden`, which has no
    // `text-overflow` of its own and so clips with no "…" at all. Confirmed
    // by a pressure-test render ("Bartholomew" clipped to "BARTHOLOME" with
    // no ellipsis showing) before this fix.
    //
    // `transform: translateY(...)` shifts the whole two-line block up by
    // roughly half the car-subtitle line's height. Without it, the row's
    // `alignItems: center` centers this ENTIRE two-line block, which puts
    // the name line itself visibly above the row's true vertical center —
    // every other cell in the row (TIME/TOTAL/DIFF) is a single line, so
    // ITS center IS the row's center, and the name read as floating high
    // relative to them. Shifting the block (not just the name text) keeps
    // the name/subtitle gap intact while moving the name's own baseline
    // down to line up with the numbers beside it. Doesn't touch layout/
    // centering math (transform paints offset, it doesn't resize the box),
    // so this can't reintroduce the clipping/ellipsis issues `width: 100%`
    // above exists to prevent.
    <div
      style={{
        color: textColorFor(state),
        minWidth: 0,
        width: "100%",
        // no car subtitle -> no offset needed, `alignItems: center` on the
        // row already centers this single line correctly on its own.
        transform: showCar ? `translateY(${Math.round(carSize * 0.55)}px)` : undefined,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: nameSize,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          width: "100%",
        }}
      >
        {displayName(r.name)}
      </div>
      {showCar && (
        <div
          style={{
            fontSize: carSize,
            opacity: 0.75,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            width: "100%",
          }}
        >
          {r.car}
        </div>
      )}
    </div>
  ),
});

const penaltyBadge = (icon: ReactNode, count: number, textColor: string) => (
  <div style={{ display: "flex", alignItems: "center", gap: PENALTY_ICON_GAP }}>
    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: RECAP_VALUE_SIZE, color: textColor }}>{count}</span>
    {icon}
  </div>
);

/**
 * A dedicated fixed-width column for cone hits / missed gates — a count
 * (always shown, even at 1) plus one `ConeIcon`/`MissedGateIcon`, not N
 * repeated icons, so the footprint stays fixed regardless of how high the
 * count gets. Own column rather than living inside `nameCell` (an earlier
 * pass at this) — squeezed into the name's own (flexible-width) cell,
 * badges either crowded a long name or, once the name was protected from
 * ever shrinking, could get silently clipped away entirely with no trace.
 * A real fixed-width column can't be crowded out by name/car text length
 * at all. Cone badge on top, missed-gate badge below when both are
 * present, both right-aligned to the column's edge. Same background/text
 * treatment as the TOTAL endcap (`endcapBgFor`/`endcapTextFor`) — the two
 * sit right next to each other, so they read as one family, not two
 * unrelated cells; `null` content (no cell background/border of its own —
 * same as every other data cell) when neither applies, e.g. a clean-sheet
 * racer. Callers are responsible for the counts being "through" at this
 * point — see `rallycrossPreviousCurrentRowCells`/
 * `rallycrossFinalRevealCells`, which derive both from
 * `r.cones`/`r.missedGates` (already sliced to the current snapshot by
 * `runProgress.ts`), so the counts only grow leg to leg as the recap
 * progresses through the event, not all at once.
 */
const penaltyCell = (
  coneCount: number,
  missedGateCount: number,
  state: RowState,
  showFeaturedRowHighlight: boolean = true,
): Cell => {
  const textColor = endcapTextFor(state, showFeaturedRowHighlight);
  return {
    width: PENALTY_CELL_WIDTH,
    padding: "18px 7px 18px 2px",
    align: "right",
    background: endcapBgFor(state, showFeaturedRowHighlight),
    content:
      coneCount || missedGateCount ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
            // knocks back the icon along with the count digit — the icon's
            // own fill (ConeIcon/MissedGateIcon) isn't driven by `textColor`,
            // so opacity is the only lever that dims both together.
            opacity: endcapOpacityFor(state),
          }}
        >
          {coneCount ? penaltyBadge(<ConeIcon size={PENALTY_CONE_SIZE} />, coneCount, textColor) : null}
          {missedGateCount ? penaltyBadge(<MissedGateIcon size={PENALTY_MISSED_GATE_SIZE} />, missedGateCount, textColor) : null}
        </div>
      ) : null,
  };
};

export const rankCell = (r: { pos: number }, state: RowState): Cell => ({
  padding: "18px 0 18px 30px",
  width: 130,
  // only "featured" inverts to a black circle — "leader" (green) keeps the
  // standard white circle/black number, same as every other row.
  content: <RankCircle pos={r.pos} diameter={68} invert={state.featured} />,
});

/** Track — rank, name/car, gap to leader. Track events run "laps", not "runs" — no runs array here. */
export const trackRowCells = (r: TrackRacer, _i: number, state: RowState): Cell[] => [
  rankCell(r, state),
  nameCell(r, state),
  {
    padding: "18px 30px",
    align: "right",
    width: 220,
    content: (
      <div style={{ fontFamily: "monospace", fontSize: 34, color: textColorFor(state) }}>{r.gap}</div>
    ),
  },
];

/**
 * Autocross — last run in-flow, fastest run flush right in its own
 * full-height cell. That cell (and the whole row) goes solid Flag green
 * (confirmation, not a mood pick, per HANDOFF.md) for whoever currently
 * holds P1 overall — regardless of whether they're "featured". Featured
 * (yellow) always wins over leader (green) if a row is somehow both.
 */
export const autocrossRowCells = (r: RankedRunRacer, _i: number, state: RowState): Cell[] => [
  rankCell(r, state),
  nameCell(r, state),
  {
    padding: "18px 30px",
    width: 220,
    content: <StatBlock label="Last" value={formatRunTime(lastOf(r.runs))} textColor={textColorFor(state)} />,
  },
  {
    padding: "0 34px",
    align: "center",
    width: 240,
    background: endcapBgFor(state),
    content: (
      <StatBlock label="Fast" value={formatRunTime(fastestOf(r.runs))} textColor={endcapTextFor(state)} />
    ),
  },
];

/**
 * Rallycross — fastest, then last, in-flow; total (cumulative across all
 * runs, the actual ranking stat) flush right in its own full-height cell.
 * Same featured (yellow) / leader (green) / normal (dark-gray endcap)
 * treatment as autocross.
 */
export const rallycrossRowCells = (r: RankedRallycrossRacer, _i: number, state: RowState): Cell[] => [
  rankCell(r, state),
  nameCell(r, state),
  {
    padding: "18px 22px",
    width: 220,
    content: (
      <StatBlock label="Fast" value={formatRunTime(fastestOf(r.runs))} textColor={textColorFor(state)} />
    ),
  },
  {
    padding: "18px 30px",
    width: 220,
    content: <StatBlock label="Last" value={formatRunTime(lastOf(r.runs))} textColor={textColorFor(state)} />,
  },
  {
    padding: "0 34px",
    align: "center",
    width: 240,
    background: endcapBgFor(state),
    content: (
      <StatBlock label="Total" value={formatRunTime(r.total)} textColor={endcapTextFor(state)} />
    ),
  },
];

/**
 * Same shape as `rallycrossRowCells`, but simplified for the run-by-run
 * recap: just this leg's run time, the TOTAL endcap, the PENALTY column
 * (cones/missed gates, see `penaltyCell`), then a gap-to-leader column at
 * the very end of the row. No per-cell labels — see
 * `rallycrossPreviousCurrentHeaderCells` below, which carries
 * TIME/TOTAL/(PENALTY)/DIFF in a header strip instead. See
 * `showPreviousCurrentRuns` in types.ts.
 *
 * A factory (not a bare `(r, i, state) => Cell[]`) so `showFeaturedRowHighlight`
 * — a per-config flag, not per-row state — can reach the endcap's own color
 * rule (`endcapBgFor`/`endcapTextFor`) without threading it through `RowState`
 * itself, which every OTHER cell/row consumer relies on staying just
 * `{featured, leader}`. `racerNames`/`boardWidth` must match whatever
 * `rallycrossPreviousCurrentHeaderCells` above is called with — see
 * `recapColumnWidths`'s own doc comment.
 */
export const rallycrossPreviousCurrentRowCells =
  (
    showFeaturedRowHighlight: boolean = true,
    racerNames: string[] = [],
    boardWidth: number = 1080,
    // only feeds the width math below (`rankCell` is always cell 0 here
    // regardless — `withoutRankColumn` in Leaderboard.tsx strips it back out
    // post-hoc when `showRank` is off), so this needs to match whatever
    // `showRank` the caller is actually using or the freed-space math below
    // budgets for a rank column that never actually renders, leaving a real
    // dead gap on the left instead of the one this whole feature exists to
    // remove.
    showRank: boolean = true,
    leftSafeMargin: number = 0,
  ) =>
  (r: RankedRallycrossRacer, _i: number, state: RowState): Cell[] => {
    const { nameWidth, timeWidth, totalWidth, diffWidth, diffPadding } = recapColumnWidths(racerNames, boardWidth, showRank, leftSafeMargin);
    return [
      rankCell(r, state),
      nameCell(r, state, RECAP_NAME_SIZE, RECAP_CAR_SIZE, RECAP_NAME_PADDING, false, nameWidth),
      {
        // sized at RECAP_VALUE_SIZE, not VALUE_SIZE — see that constant's own
        // comment. "SS.mmm" never runs past 6 characters, so this column
        // gives up the least room for the asymmetric safe-margin budget.
        // Right padding is 2x the left (22 vs 11) per Ian — width grew by the
        // same 11px that added so the actual text keeps the same margin it
        // had before, same "shrink/grow the box to match the padding change"
        // rule as `RECAP_NAME_PADDING`'s comment describes. `width` now comes
        // from `recapColumnWidths` — it grows past its 165px base to soak up
        // whatever the name column doesn't need (see that function).
        padding: RECAP_CELL_PADDING,
        width: timeWidth,
        content: <StatBlock value={formatRunTime(lastOf(r.runs))} textColor={textColorFor(state)} valueSize={RECAP_VALUE_SIZE} />,
      },
      {
        // sized at RECAP_VALUE_SIZE — see that constant's comment. Horizontal
        // padding is 2x what the TIME/DIFF columns' own base padding is (22px
        // vs 11px each side) per Ian — width grew by the matching 22px total
        // so the total-time text keeps the same fit margin it had before.
        padding: RECAP_CELL_PADDING,
        width: totalWidth,
        background: endcapBgFor(state, showFeaturedRowHighlight),
        content: (
          <div style={{ opacity: endcapOpacityFor(state) }}>
            <StatBlock
              value={formatRunTime(r.total)}
              textColor={endcapTextFor(state, showFeaturedRowHighlight)}
              valueSize={RECAP_VALUE_SIZE}
            />
          </div>
        ),
      },
      penaltyCell(totalCones(r.cones), totalMissedGates(r.missedGates), state, showFeaturedRowHighlight),
      {
        // Wide + sized at RECAP_VALUE_SIZE — the widest realistic double-digit
        // gap ("+12.153", "+13.793") plus the `rightSafeMargin` safe-margin
        // `LeaderboardShell` adds on top of the base 30px right pad (see
        // `edgeInset`) needs real room: at full VALUE_SIZE this column
        // silently overflowed and got clipped at its own left edge by
        // `overflow: hidden`, which read as "no left padding at all" for
        // exactly the rows with the widest gaps — see git history for that
        // investigation. Shrinking to RECAP_VALUE_SIZE and widening the box
        // fixes it without stealing more room from the name column. Left-
        // aligned per Ian (was right-aligned) — no `align` passed, matching
        // the other value columns' default.
        padding: diffPadding,
        width: diffWidth,
        content:
          r.pos === 1 ? null : (
            <StatBlock value={formatGap(r.gapToLeader)} textColor={textColorFor(state)} valueSize={RECAP_VALUE_SIZE} />
          ),
      },
    ];
  };

/**
 * The FINAL reveal for `showPreviousCurrentRuns` mode (once `throughRun` is
 * final) — fastest run of the whole event, total time, the PENALTY column
 * (every cone/missed gate from the whole event, since
 * `r.cones`/`r.missedGates` are unsliced by this point), then the gap back
 * to whoever won: the payoff stats once the event's actually over, not a
 * run-to-run delta (there's no "current run" once there isn't a next one).
 * No per-cell labels — see `rallycrossFinalRevealHeaderCells` below, which
 * carries FASTEST/TOTAL/(PENALTY)/DIFF in a header strip instead. A
 * factory for the same reason as `rallycrossPreviousCurrentRowCells`
 * above, with the same `racerNames`/`boardWidth`/`showRank` contract.
 */
export const rallycrossFinalRevealCells =
  (
    showFeaturedRowHighlight: boolean = true,
    racerNames: string[] = [],
    boardWidth: number = 1080,
    showRank: boolean = true,
    leftSafeMargin: number = 0,
  ) =>
  (r: RankedRallycrossRacer, _i: number, state: RowState): Cell[] => {
    const { nameWidth, timeWidth, totalWidth, diffWidth, diffPadding } = recapColumnWidths(racerNames, boardWidth, showRank, leftSafeMargin);
    return [
      rankCell(r, state),
      nameCell(r, state, RECAP_NAME_SIZE, RECAP_CAR_SIZE, RECAP_NAME_PADDING, false, nameWidth),
      {
        // sized at RECAP_VALUE_SIZE — see the TIME cell's matching comment in
        // `rallycrossPreviousCurrentRowCells` above.
        padding: RECAP_CELL_PADDING,
        width: timeWidth,
        content: (
          <StatBlock value={formatRunTime(fastestOf(r.runs))} textColor={textColorFor(state)} valueSize={RECAP_VALUE_SIZE} />
        ),
      },
      {
        // sized at RECAP_VALUE_SIZE — see that constant's comment. Horizontal
        // padding is 2x what the TIME/DIFF columns' own base padding is (22px
        // vs 11px each side) per Ian — width grew by the matching 22px total
        // so the total-time text keeps the same fit margin it had before.
        padding: RECAP_CELL_PADDING,
        width: totalWidth,
        background: endcapBgFor(state, showFeaturedRowHighlight),
        content: (
          <div style={{ opacity: endcapOpacityFor(state) }}>
            <StatBlock
              value={formatRunTime(r.total)}
              textColor={endcapTextFor(state, showFeaturedRowHighlight)}
              valueSize={RECAP_VALUE_SIZE}
            />
          </div>
        ),
      },
      penaltyCell(totalCones(r.cones), totalMissedGates(r.missedGates), state, showFeaturedRowHighlight),
      {
        // Wide + sized at RECAP_VALUE_SIZE — the widest realistic double-digit
        // gap ("+12.153", "+13.793") plus the `rightSafeMargin` safe-margin
        // `LeaderboardShell` adds on top of the base 30px right pad (see
        // `edgeInset`) needs real room: at full VALUE_SIZE this column
        // silently overflowed and got clipped at its own left edge by
        // `overflow: hidden`, which read as "no left padding at all" for
        // exactly the rows with the widest gaps — see git history for that
        // investigation. Shrinking to RECAP_VALUE_SIZE and widening the box
        // fixes it without stealing more room from the name column. Left-
        // aligned per Ian (was right-aligned) — no `align` passed, matching
        // the other value columns' default.
        padding: diffPadding,
        width: diffWidth,
        content:
          r.pos === 1 ? null : (
            <StatBlock value={formatGap(r.gapToLeader)} textColor={textColorFor(state)} valueSize={RECAP_VALUE_SIZE} />
          ),
      },
    ];
  };

/**
 * Plain uppercase label, no value — one cell in the merged title-bar/header
 * row `LeaderboardShell` renders in place of the plain title bar (see
 * `columnHeaders`, `HEADER_ROW_HEIGHT` in layout.ts). Padding/width/align
 * must match the corresponding data cell exactly, or the header won't sit
 * above its column.
 */
const headerCell = (
  label: string,
  // `undefined` (omitted `width`) makes this a FLEXIBLE header cell, same
  // as the data row's own width-less "name"/driver column — used by the
  // "Driver" header (see `driverHeaderCells` below), which needs to track the
  // flexible name column's width, not a fixed one.
  width: number | undefined,
  padding: string,
  align?: Cell["align"],
  // matches the corresponding data cell's own value size — the short-form
  // recap's headers pass `RECAP_VALUE_SIZE` here; every other caller omits
  // it and keeps the shared `VALUE_SIZE`.
  fontSize: number = VALUE_SIZE,
): Cell => ({
  ...(width !== undefined ? { width } : {}),
  padding,
  align,
  content: (
    <div
      style={{
        // same size as the row values themselves (StatBlock's VALUE_SIZE,
        // or `fontSize` when overridden) — reads as a header paired with
        // its column, not a mismatched caption sized off the title bar's
        // own run-number text.
        fontSize,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
        color: "#ffffff",
        opacity: 0.6,
      }}
    >
      {label}
    </div>
  ),
});

/** blank rank spacer, plus a "Driver" label in the width-less "name" slot —
 * a plain header cell now, styled identically to Time/Total/Diff (see
 * `headerCell`), not the run-number flash/push this slot used to carry.
 * That animation moved to its own dedicated row above the column-header
 * row entirely (see `LeaderboardShell`'s `runLabelRow` / the `RUN N` row
 * doc comment there) — per Ian, the run number deserved its own full-width
 * centered row rather than being squeezed into the narrow name column's
 * slot, so this slot went back to being an ordinary column label like
 * every other header. `showRank` mirrors whichever the caller passed to
 * the row-cell renderer itself (rank cell included or not). The "Driver"
 * cell's `padding` is explicitly `RECAP_NAME_PADDING`, matching
 * `nameCell`'s padding below it exactly (not just "look close") — the
 * header row and the data rows are separate DOM elements with no other
 * shared anchor to align them. */
const driverHeaderCells = (showRank: boolean, nameWidth: number): Cell[] => [
  ...(showRank ? [{ width: 130, content: null } as Cell] : []),
  headerCell("Driver", nameWidth, RECAP_NAME_PADDING, undefined, RECAP_VALUE_SIZE),
];

/** Column headers for `rallycrossPreviousCurrentRowCells` — Driver (fixed to
 * `recapColumnWidths`' measured name width, not the header row's own flex
 * fill — see that function's doc comment) / TIME / TOTAL (spanning the
 * TOTAL + PENALTY columns, left-aligned — see that header cell's own
 * comment) / DIFF. `racerNames`/`boardWidth` must be the SAME values the
 * matching row-cell factory below was called with, or the header columns
 * drift out of alignment with the data columns beneath them. */
export const rallycrossPreviousCurrentHeaderCells = (
  showRank: boolean,
  racerNames: string[] = [],
  boardWidth: number = 1080,
  leftSafeMargin: number = 0,
): Cell[] => {
  const { nameWidth, timeWidth, totalWidth, diffWidth, diffPadding } = recapColumnWidths(racerNames, boardWidth, showRank, leftSafeMargin);
  return [
    ...driverHeaderCells(showRank, nameWidth),
    headerCell("Time", timeWidth, RECAP_CELL_PADDING, undefined, RECAP_VALUE_SIZE),
    // spans the TOTAL value box AND the PENALTY (cone/gate count) column
    // right next to it — the two data cells stay separate (PENALTY still
    // needs its own column for the count/icon), this just merges their
    // shared header into one wider label. Left-aligned (the default — no
    // `align` passed), not centered: a centered label drifted toward the
    // PENALTY side of the combined span, reading as disconnected from the
    // TOTAL value it's actually labeling.
    headerCell("Total", totalWidth + PENALTY_CELL_WIDTH, RECAP_CELL_PADDING, undefined, RECAP_VALUE_SIZE),
    headerCell("Diff", diffWidth, diffPadding, undefined, RECAP_VALUE_SIZE),
  ];
};

/** Column headers for `rallycrossFinalRevealCells` — Driver (i.e. the
 * "FINAL" row's header) / FAST / TOTAL (spanning the TOTAL + PENALTY
 * columns, see `rallycrossPreviousCurrentHeaderCells` above) / DIFF. Same
 * `racerNames`/`boardWidth` contract as that function. */
export const rallycrossFinalRevealHeaderCells = (
  showRank: boolean,
  racerNames: string[] = [],
  boardWidth: number = 1080,
  leftSafeMargin: number = 0,
): Cell[] => {
  const { nameWidth, timeWidth, totalWidth, diffWidth, diffPadding } = recapColumnWidths(racerNames, boardWidth, showRank, leftSafeMargin);
  return [
    ...driverHeaderCells(showRank, nameWidth),
    headerCell("Fast", timeWidth, RECAP_CELL_PADDING, undefined, RECAP_VALUE_SIZE),
    // see `rallycrossPreviousCurrentHeaderCells` above — spans TOTAL +
    // PENALTY, left-aligned on purpose.
    headerCell("Total", totalWidth + PENALTY_CELL_WIDTH, RECAP_CELL_PADDING, undefined, RECAP_VALUE_SIZE),
    headerCell("Diff", diffWidth, diffPadding, undefined, RECAP_VALUE_SIZE),
  ];
};
