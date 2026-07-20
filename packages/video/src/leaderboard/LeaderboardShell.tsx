import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, withAlpha } from "../theme";
import {
  TITLE_HEIGHT,
  HEADER_ROW_HEIGHT,
  POSITION_TRANSITION_HOLD_SECONDS,
  POSITION_TRANSITION_SLIDE_SECONDS,
  SIMULTANEOUS_TRANSITION_HOLD_SECONDS,
  SIMULTANEOUS_TRANSITION_LABEL_LEAD_SECONDS,
  SIMULTANEOUS_TRANSITION_SLIDE_SECONDS,
} from "./layout";

export type Cell = {
  content: React.ReactNode;
  /** static background for this cell — never animated, so column edges never move */
  background?: string;
  align?: "left" | "right" | "center";
  padding?: string;
  /** fixed pixel width — every column except the name/car column (which is
   * left unset and flexes to fill the remainder) needs one. Columns are laid
   * out with flexbox, not a `<table>`: `tableLayout: auto` recomputes column
   * widths from whichever content is CURRENTLY in the DOM, and during the
   * position-change crossfade — two overlapping text layers, numbers
   * changing frame to frame — that recomputation fires continuously, which
   * is what the intermittent whole-row "bump/realignment" turned out to be.
   * Fixed widths make that impossible: nothing can ever move column edges. */
  width?: number;
};

/**
 * `featured` (yellow) is set explicitly by the caller — the driver we care
 * about; it always wins for the row's ambient background. `leader` (green)
 * is computed independently — whoever currently holds P1 (rank 1) overall.
 * The two are independent, not mutually exclusive: a featured racer who's
 * also currently the leader still gets a yellow row, but their fast/total
 * cell gets its own green accent (see rowCells.tsx).
 */
export type RowState = { featured: boolean; leader: boolean };

/**
 * "Camera follow" position-change animation, in two strictly sequential
 * phases (see runProgress.ts's `derivePositionSequence` doc comment for why):
 *
 * 1. **Content swap** — at the moment the reveal begins (`holdFrames`), EVERY
 *    row's displayed content (times, rank digit) cuts from `from` to `to`, for
 *    every racer simultaneously, while rows are still sitting in `from`'s
 *    order. A row's digit can briefly disagree with its own on-screen slot
 *    right at that instant — that's intentional: "the result is in," before
 *    "the board reorders to match."
 * 2. **Shuffle** — only after that cut does any row's SLOT change: one
 *    featured racer at a time, bottom-placed-first, slides from its `from`
 *    slot to its `to` slot while the camera tracks it; bystanders shift
 *    discretely out of the way. Content never changes again during this
 *    phase — every row is already showing `to`.
 *
 * Mutually exclusive with `scroll` — see LeaderboardShell's rendering branch
 * below.
 */
export type PositionTransitionConfig<T> = {
  /** everyone's standings at `previousThroughRun` — every row's content
   * before the reveal cuts over. */
  from: T[];
  /** everyone's standings at `throughRun`/final — every row's content from
   * the reveal onward, and the board's final resting order. */
  to: T[];
  /** who gets an animated turn, bottom-placed-first (by `from` position) —
   * every featured racer gets one, even if their rank doesn't change (see
   * the "flash in place" treatment in the rendering branch below). */
  moverNames: string[];
  /** `orderSteps[k]`/`orderSteps[k+1]` — pure name-array ordering scaffolding
   * for mover k's own turn: every row's on-screen SLOT during that turn comes
   * from this pair. Never touched for content. `orderSteps.length` is
   * `moverNames.length + 1`, and `orderSteps[N]` is `to`'s order. */
  orderSteps: string[][];
  rowState: (row: T) => RowState;
  viewportRows: number;
  rowHeight: number;
  /** run-number label (e.g. "RUN 2"), right-aligned in the title bar — swaps
   * once the reveal actually begins. */
  fromRunLabel?: string | null;
  toRunLabel?: string | null;
};

/**
 * "Everyone moves at once" position-change animation — the alternative to
 * `PositionTransitionConfig`'s staged one-mover-at-a-time camera follow, for
 * a fast-paced run-by-run recap where staging each featured racer's move
 * individually (built for one deliberate reveal) is too slow repeated
 * across many runs. Unlike the staged branch, the run-label flash/push and
 * the rows' own content-cutover are two distinct beats, not one: the label
 * announces the new run first, then — `SIMULTANEOUS_TRANSITION_LABEL_LEAD_SECONDS`
 * later — every row's displayed content commits from `from` to `to` for
 * every racer simultaneously, and the SLOT/shuffle phase has no staging at
 * all: every row interpolates directly from its `from`-index to its
 * `to`-index in one synchronized slide, mover or bystander alike — no
 * per-racer turn, no camera spotlight. Mutually exclusive with `scroll` and
 * `positionTransition`.
 */
export type SimultaneousTransitionConfig<T> = {
  /** everyone's standings at `previousThroughRun` — every row's content and
   * slot before the reveal cuts over. */
  from: T[];
  /** everyone's standings at `throughRun`/final — every row's content and
   * slot from the reveal onward. */
  to: T[];
  rowState: (row: T) => RowState;
  viewportRows: number;
  rowHeight: number;
  /** run-number label (e.g. "RUN 2") — swaps first, `SIMULTANEOUS_TRANSITION_LABEL_LEAD_SECONDS`
   * ahead of the rows' own content/slot cutover. */
  fromRunLabel?: string | null;
  toRunLabel?: string | null;
  /** overrides the shell's `renderCells` for the `to` (revealed) side only,
   * once content has committed — the `from` side always uses the regular
   * `renderCells`. For the leg whose `to` is the true final state
   * (`showPreviousCurrentRuns`'s fastest/cones/total reveal, see
   * Leaderboard.tsx) — every other leg leaves this unset and both sides
   * render identically, same as before this existed. */
  renderCellsTo?: (row: T, index: number, state: RowState) => Cell[];
};

export type ScrollConfig = {
  /** how many rows are visible in the fixed-size viewport at once */
  viewportRows: number;
  /** explicit row height — required so scroll math lines up with real geometry */
  rowHeight: number;
  /** row-index (0-based) tops to stop on, in play order — last one should be 0 (the top) */
  stops: number[];
  /** seconds to hold on each stop */
  holdSeconds?: number;
  /** seconds to spend scrolling between stops */
  transitionSeconds?: number;
  /** false skips the hold on stops[0] and heads straight into the scroll — for
   * when the starting window has nobody worth lingering on. Default true. */
  holdAtStart?: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Paints an entire row's background as ONE hard-stop gradient spanning every
 * column, instead of each cell painting its own separate background box.
 * Adjacent same-row boxes that individually paint solid colors can show a
 * hairline seam at the shared edge — a GPU compositing/anti-aliasing artifact
 * at the boundary between two separately-rasterized elements, not a gap or
 * misalignment (confirmed via pixel measurement: the boundary x-position
 * never moves). A single gradient is one paint surface with no boundary to
 * bleed across.
 */
/** ambient row tint — deliberately the darker ramp step (the endcap gets the
 * brighter one, see `endcapBgFor` in rowCells.tsx) since the row is the
 * majority of what's on screen and the fast/total cell is the callout that
 * should pop brighter against it. Exported so Storybook-only preview
 * components (e.g. a static full-roster list) can render visually identical
 * rows without duplicating the color rule.
 *
 * `showFeaturedRowHighlight` (default `true`, matching every existing
 * caller) — set `false` to flatten featured rows to the same tint as every
 * other row, for an interface where the ambient yellow reads as too loud;
 * `state.featured` still drives text color (`textColorFor`) and the TOTAL
 * endcap's own bright treatment (`endcapBgFor`) either way — this only
 * affects the row's own background. */
export const rowBgFor = (state: RowState, showFeaturedRowHighlight: boolean = true) =>
  state.featured && showFeaturedRowHighlight
    ? color.core.spark.ramp[700]
    : state.leader
      ? color.support.flag.ramp[900]
      : withAlpha(color.neutral.gray100, 0.12);

export const rowBackgroundGradient = (cells: Cell[], totalWidth: number, fallbackBg: string): string => {
  const fixedTotal = cells.reduce((sum, c) => sum + (c.width ?? 0), 0);
  const flexWidth = Math.max(0, totalWidth - fixedTotal);
  let x = 0;
  const stops: string[] = [];
  for (const c of cells) {
    const w = c.width ?? flexWidth;
    const bg = c.background ?? fallbackBg;
    stops.push(`${bg} ${x}px`, `${bg} ${x + w}px`);
    x += w;
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
};

/**
 * Shared shell for the corner-anchored leaderboard family — flexbox rows with
 * fixed-width columns (declared per cell via `Cell.width`; the name/car
 * column is left unset and flexes to fill the remainder), not a `<table>`.
 * `tableLayout: auto` recomputes column widths from whatever content is
 * currently in the DOM — during the position-change crossfade (two
 * overlapping text layers, numbers changing every frame) that recomputation
 * fired continuously, which was an intermittent whole-row "bump" that no
 * amount of z-index/opacity tuning could fix. Fixed widths make it
 * structurally impossible for a column edge to move. Every cell box and its
 * background are always static (that's what keeps the grid gapless); only
 * the content *inside* each cell slides/fades in on a per-row stagger.
 *
 * With `scroll`, the table can hold more rows than fit in the card — a fixed
 * viewport clips it, and the table scrolls beneath that clip, pausing on
 * each stop (typically: each featured racer, ending at the top of the list).
 *
 * With `positionTransition` instead, the table plays a one-time "camera
 * follow" animation between a chain of standings snapshots (see
 * `PositionTransitionConfig` above) — mutually exclusive with `scroll`.
 *
 * The whole card is a "drawer" that slides in from the left edge of the
 * frame on mount and — unless `animateOut` is set `false` — slides back out
 * the same way near the end of the render. `title` is optional context
 * ("what am I looking at" — a single class, the whole field, OIO drivers vs.
 * the competition, etc); when present it's locked to the top of the card and
 * rides along with the drawer, not animated separately.
 */
export const LeaderboardShell = <T extends { pos: number; name: string }>({
  rows,
  rowState,
  renderCells,
  width = 900,
  scroll,
  positionTransition,
  simultaneousTransition,
  top,
  left = 0,
  bottom = 0,
  title,
  runLabel,
  heroRunLabel = false,
  columnHeaders,
  showFeaturedRowHighlight = true,
  animateOut = true,
  enterAnimation = true,
}: {
  rows?: T[];
  rowState?: (row: T, index: number) => RowState;
  renderCells: (row: T, index: number, state: RowState) => Cell[];
  width?: number;
  scroll?: ScrollConfig;
  positionTransition?: PositionTransitionConfig<T>;
  simultaneousTransition?: SimultaneousTransitionConfig<T>;
  /** anchor to the top instead of the bottom — for edge-to-edge, full-frame-height boards */
  top?: number;
  /** left-edge offset — every board is full-bleed to the corner by default */
  left?: number;
  /** bottom-edge offset, only used when `top` is unset (compact mode) — full-bleed by default */
  bottom?: number;
  /** optional context row, locked to the top of the card above the scrolling table */
  title?: string | null;
  /** run-number indicator (e.g. "RUN 2", "FINAL"), right-aligned in the title
   * bar — ignored when `positionTransition`/`simultaneousTransition` supplies
   * its own from/to labels. */
  runLabel?: string | null;
  /** an optional row of column-header cells (see `HEADER_ROW_HEIGHT` in
   * layout.ts and `rallycrossPreviousCurrentHeaderCells`/
   * `rallycrossFinalRevealHeaderCells` in rowCells.tsx) that REPLACES the
   * separate title bar — one merged row, not two stacked ones. The
   * title bar's own run-number flash/push still plays, just inside
   * whichever header cell has no fixed `width` (the "name" column's slot)
   * instead of centered across the full board; every other header cell
   * renders its own `content` (TIME/TOTAL/DIFF, etc) untouched. Cell
   * widths/padding must match the data row's own cells for the columns to
   * actually line up. Omit for boards with no need of one — the plain title
   * bar renders exactly as before. */
  columnHeaders?: Cell[];
  /** replaces the title/runLabel split layout with just the run label,
   * centered and sized like a driver name, flashing at the same instant
   * content commits — see LeaderboardConfig.heroRunLabel. Default false. */
  heroRunLabel?: boolean;
  /** see `rowBgFor`'s own doc comment — `false` flattens featured rows to
   * the same ambient tint as every other row. Default `true`. */
  showFeaturedRowHighlight?: boolean;
  /** slides the board back out (mirroring the entrance) near the end of the
   * render instead of holding on its final frame. Default true. */
  animateOut?: boolean;
  /** slides the board in from off-screen on mount. Default true. Set false
   * when this instance is one leg of several stitched back to back (see
   * `LeaderboardRunSequence`) and isn't the first — the drawer should
   * already read as "shown" going in, not slide in again every leg. */
  enterAnimation?: boolean;
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const pulsePeriod = fps * 2.4;
  const pulse = (Math.sin((frame / pulsePeriod) * Math.PI * 2) + 1) / 2;
  const leaderGlow = 16 + pulse * 22;

  // the board is a "drawer" that slides in from the left edge of the frame —
  // fully off-screen to start, sliding to its resting position. `shown` runs
  // 0 (off-screen) → 1 (in place); if `animateOut`, it eases back to 0 near
  // the end of the render, mirroring the entrance, instead of just holding.
  const DRAWER_FRAMES = 20;
  const cardIn = enterAnimation
    ? spring({ fps, frame, config: { damping: 200 }, durationInFrames: DRAWER_FRAMES })
    : 1;
  const exitStart = durationInFrames - DRAWER_FRAMES;
  const cardOut = animateOut
    ? spring({ fps, frame: frame - exitStart, config: { damping: 200 }, durationInFrames: DRAWER_FRAMES })
    : 0;
  const shown = cardIn * (1 - cardOut);
  const slideDistance = width + Math.max(left, 0) + 60;

  let scrollY = 0;
  let table: React.ReactNode;
  let resolvedRunLabel: string | null | undefined = runLabel;
  // the label just before the current change — only set while a push
  // transition is in flight; `null` means there's nothing to push out (a
  // plain static board, or a transition that hasn't started yet).
  let prevRunLabel: string | null | undefined = null;
  // 0..1 — 0 before the cutover (`prevRunLabel` fully in place), 1 once the
  // push settles on `resolvedRunLabel`. Drives both the label push (new
  // slides down from above, old is pushed down and out — see `heroRunLabel`
  // rendering below) and the flash, so they land in the same beat.
  let runLabelProgress = 1;
  // 0..1 pulse over the run label right when it changes — only
  // `positionTransition`/`simultaneousTransition` ever change it mid-render,
  // so this stays 0 for a plain static board. See `heroRunLabel`.
  let runLabelFlash = 0;
  const FLASH_FRAMES = Math.round(fps * 0.5);
  const flashPulse = (framesSinceCutover: number) =>
    framesSinceCutover >= 0 && framesSinceCutover < FLASH_FRAMES
      ? Math.sin((framesSinceCutover / FLASH_FRAMES) * Math.PI)
      : 0;
  // same window as the flash — the label push and the flash behind it read
  // as one beat, not two independently-timed effects.
  const labelPushProgress = (framesSinceCutover: number) => {
    const raw = clamp(framesSinceCutover / FLASH_FRAMES, 0, 1);
    return raw * raw * (3 - 2 * raw);
  };

  if (positionTransition) {
    const { from, to, moverNames, orderSteps, rowState: transitionRowState, viewportRows, rowHeight } = positionTransition;
    const N = moverNames.length;
    const total = to.length;
    const maxScrollRows = Math.max(0, total - viewportRows);
    // fixed DOM/paint order (and therefore column widths) for the whole animation —
    // the final result. Where a row is drawn on screen is entirely a matter of its
    // per-frame `transform`, not DOM position.
    const domOrder = to;
    // real snapshots — the ONLY source for what a row's content ever displays,
    // and never re-derived once picked (see the `contentRevealed` cutover below).
    const fromByName = new Map(from.map((r) => [r.name, r]));
    const toByName = new Map(to.map((r) => [r.name, r]));
    // pure name-array ordering scaffolding — never read for content, only for
    // which slot a row occupies once the reveal begins (see runProgress.ts doc
    // comment). `orderSteps[0]` already reflects bystanders' settled `to`-order
    // backdrop, NOT the true pre-commit hold — that's `holdOrder`, below.
    const orderIndexByName = orderSteps.map((step) => new Map(step.map((name, i) => [name, i])));
    // the TRUE pre-commit hold: every row in `from`'s own raw order, `from`'s
    // own content — nothing has reflowed yet. Entrance stagger keys off this,
    // not `orderSteps[0]`, so the initial sweep-in matches what's actually
    // on screen before any content/ordering cutover.
    const holdOrder = from.map((r) => r.name);
    const holdIndexByName = new Map(holdOrder.map((name, i) => [name, i]));
    const initialIndexByName = holdIndexByName;

    const holdFrames = POSITION_TRANSITION_HOLD_SECONDS * fps;
    const slideFrames = POSITION_TRANSITION_SLIDE_SECONDS * fps;
    const centerOffset = Math.floor((viewportRows - 1) / 2);

    // Precompute where the camera starts and lands for each mover's own turn —
    // the building block for panning smoothly *between* movers too (see below).
    const moverInfo = moverNames.map((name, k) => {
      const fiK = orderIndexByName[k].get(name) ?? 0;
      const tiK = orderIndexByName[k + 1].get(name) ?? 0;
      // centering wants to put this mover `centerOffset` rows down from the
      // camera's top edge — but clamps to 0 once the mover is close enough to
      // rank 1 that there's nothing above to center around. THAT clamp (not
      // "is this mover somewhere in the first viewportful", which covers far
      // more rows than "near the top" actually means) is what should suppress
      // scrolling: only when the mover is genuinely at the top already, AND
      // its move keeps it (and whoever it swaps with) inside that same
      // already-visible top window the whole turn, is there no reason to
      // move the camera at all — the naive alternative (re-center ON the
      // mover and keep it in the same screen row throughout its slide)
      // scrolls the board by exactly the distance the mover moves, which for
      // a mover dropping FROM rank 1 pushes whoever it's swapping with off
      // the top of frame — hiding the one thing the swap is about. A mover
      // that's NOT near the top should still get the full dynamic
      // center-and-follow treatment (that's the whole appeal of this
      // animation) — the old blanket "anywhere in the first viewportful"
      // rule was killing that for every mover past rank 1 up to rank
      // `viewportRows`, not just the ones actually at the top.
      const naturalCamStart = clamp(fiK - centerOffset, 0, maxScrollRows);
      const lockedToTop = naturalCamStart === 0 && tiK < viewportRows;
      if (lockedToTop) {
        return { fiK, tiK, focusScreenSlot: fiK, camStart: 0, camEnd: 0, lockedToTop };
      }
      const camStart = naturalCamStart;
      const focusScreenSlot = fiK - camStart;
      const camEnd = clamp(tiK - focusScreenSlot, 0, maxScrollRows);
      return { fiK, tiK, focusScreenSlot, camStart, camEnd, lockedToTop };
    });

    // walk the hold → slide → hold → slide → ... → hold timeline (one slide per
    // mover) to find which step-pair we're currently between, and how far. During
    // a hold *between* two movers, also track a pan from where the camera just
    // landed to where the next mover's slide will start — without this, the
    // camera would snap instantly the moment the next slide begins (a jump that
    // reads as the whole board flashing/reshuffling for no reason).
    let moverIdx = 0;
    let rawT = 0;
    let holdPan: { from: number; to: number; progress: number } | null = null;
    if (N > 0) {
      if (frame < holdFrames) {
        moverIdx = 0;
        rawT = 0;
      } else {
        let cursor = holdFrames;
        let placed = false;
        for (let k = 0; k < N; k++) {
          if (frame < cursor + slideFrames) {
            moverIdx = k;
            rawT = (frame - cursor) / slideFrames;
            placed = true;
            break;
          }
          cursor += slideFrames;
          const holdEnd = cursor + holdFrames;
          if (frame < holdEnd) {
            moverIdx = k;
            rawT = 1;
            if (k + 1 < N) {
              holdPan = { from: moverInfo[k].camEnd, to: moverInfo[k + 1].camStart, progress: (frame - cursor) / holdFrames };
            }
            placed = true;
            break;
          }
          cursor = holdEnd;
        }
        if (!placed) {
          moverIdx = N - 1;
          rawT = 1;
        }
      }
    }
    rawT = clamp(rawT, 0, 1);
    // ease in/out — a linear slide reads mechanically for a move this deliberate.
    const t = rawT * rawT * (3 - 2 * rawT);

    // camera tracks the current mover, clamping at the board's top/bottom edge
    // once there's nowhere left to scroll — the mover then keeps sliding within
    // the fixed viewport instead of the camera following it past the edge.
    let cameraTopRow: number;
    if (holdPan) {
      const p = holdPan.progress * holdPan.progress * (3 - 2 * holdPan.progress);
      cameraTopRow = lerp(holdPan.from, holdPan.to, p);
    } else if (N > 0) {
      const info = moverInfo[moverIdx];
      // locked movers stay at 0 for their whole turn — the per-frame formula
      // below would otherwise still drift the camera by however far the
      // mover itself moves (see the comment on `lockedToTop` above).
      if (info.lockedToTop) {
        cameraTopRow = 0;
      } else {
        const moverRowNow = lerp(info.fiK, info.tiK, t);
        cameraTopRow = clamp(moverRowNow - info.focusScreenSlot, 0, maxScrollRows);
      }
    } else {
      cameraTopRow = 0;
    }
    scrollY = cameraTopRow * rowHeight;

    // the run-number label swaps once the reveal actually starts (the initial
    // hold is still "showing the earlier run" — nothing's changed yet). Kept
    // as an instant swap for the plain (non-hero) corner label; `heroRunLabel`
    // mode instead reads `prevRunLabel`/`resolvedRunLabel`/`runLabelProgress`
    // together to animate the push.
    resolvedRunLabel = frame >= holdFrames ? positionTransition.toRunLabel : positionTransition.fromRunLabel;
    prevRunLabel = positionTransition.fromRunLabel;
    runLabelProgress = labelPushProgress(frame - holdFrames);
    runLabelFlash = flashPulse(frame - holdFrames);

    // PHASE 1 — content: one global cutover, for every row at once, the instant
    // the reveal begins. Before it, every row shows `from`; from that frame on,
    // every row shows `to` — a hard cut, never a fade (an earlier version faded
    // bystanders' content in and out over the whole sequence, which read as
    // random background rows dissolving for no reason). This is deliberately
    // NOT tied to any individual mover's turn — see runProgress.ts's doc
    // comment for why re-deriving a "current" value per-mover-turn was the bug.
    const contentRevealed = frame >= holdFrames;

    // PHASE 2 — shuffle: ordering for THIS instant comes from exactly one pair
    // — orderSteps[moverIdx]/orderSteps[moverIdx + 1] — for every row, mover
    // and bystander alike. Both are complete, valid permutations, so at any t
    // the board is a well-defined arrangement: nothing ever unassigned, nothing
    // ever sharing a slot (mid-slide, the active mover momentarily passes
    // THROUGH whatever slot it's overtaking — expected, not a collision). An
    // earlier version snapped bystanders at one GLOBAL sequence-wide midpoint
    // instead of the specific mover-turn that actually displaces them: a mover
    // could finish its own slide and settle into a bystander's old slot well
    // before that bystander's unrelated global snap point arrived, producing a
    // real on-screen overlap (and, symmetrically, a gap where the bystander was
    // headed) for the whole stretch in between.
    // before content commits, every row is pinned to the true pre-commit hold
    // order — nothing has reflowed yet, so `fi === ti` for everyone and no row
    // moves. Only once `contentRevealed` does the orderSteps machinery apply.
    const osFrom = contentRevealed ? orderIndexByName[moverIdx] : holdIndexByName;
    const osTo = contentRevealed ? orderIndexByName[moverIdx + 1] : holdIndexByName;

    table = (
      <div
        style={{
          width: "100%",
          background: "rgba(0,0,0,0.82)",
          transform: `translateY(${-scrollY}px)`,
        }}
      >
        {domOrder.map((finalRow, domIndex) => {
          const name = finalRow.name;
          const fi = osFrom.get(name) ?? domIndex;
          const ti = osTo.get(name) ?? domIndex;
          const localMoved = fi !== ti;
          // a row can itself be a mover with a scheduled turn (before/during/after
          // it), or a plain bystander with none.
          const ownMoverIdx = moverNames.indexOf(name);
          const isMover = ownMoverIdx !== -1 && ownMoverIdx === moverIdx;

          // the active mover slides continuously through its own turn (from its
          // slot in orderSteps[moverIdx] to its slot in orderSteps[moverIdx + 1]);
          // every other row snaps discretely between the SAME pair, right at this
          // turn's own midpoint — never a separate global timeline.
          const rowIndexNow = isMover ? lerp(fi, ti, t) : localMoved ? (t < 0.5 ? fi : ti) : fi;

          // content is the same single global snapshot for every row, always —
          // see the Phase 1 cutover above. No per-row/per-turn logic left here.
          const contentRow = (contentRevealed ? toByName.get(name) : fromByName.get(name)) ?? finalRow;
          const displayState = transitionRowState(contentRow);
          const displayCells = renderCells(contentRow, contentRevealed ? ti : fi, displayState);

          const initialIdx = initialIndexByName.get(name) ?? domIndex;
          const rowDelay = 6 + (total - 1 - initialIdx) * 5;
          const rowIn = enterAnimation
            ? spring({ fps, frame: frame - rowDelay, config: { damping: 200 }, durationInFrames: 16 })
            : 1;
          // a row displaced THIS turn dims near-invisible right around its discrete
          // slot-swap (above) — that's what hides the jump — and stay dim through
          // the rest of the crossing so the mover reads as the only thing actually
          // moving. A raised-cosine dip (smooth at both ends and at its trough)
          // rather than a linear ramp — a fast final-15% ramp back to full opacity
          // read as a "bump/flash" right as the mover landed. Only the CURRENT
          // turn's local `t` decides this now, not a global sequence position —
          // the dip has to land exactly when the row's own slot actually snaps.
          const crossFade = !isMover && localMoved ? 1 - 0.92 * ((1 - Math.cos(2 * Math.PI * t)) / 2) : 1;
          // a mover whose rank DOESN'T change between the two REAL snapshots still
          // gets a turn (its own stat numbers may still differ) but shouldn't
          // fake-slide anywhere — instead it flashes in place, peaking mid-turn, to
          // read as "held position" rather than an aborted move. Deliberately keyed
          // off the real from/to rank (not `localMoved`, which is orderSteps-derived
          // and can differ) — this is "did they really move", not "did their
          // on-screen slot happen to shift this turn".
          const reallyMoved = from.findIndex((r) => r.name === name) !== to.findIndex((r) => r.name === name);
          const flashOpacity = isMover && !reallyMoved ? Math.sin(clamp(t, 0, 1) * Math.PI) * 0.5 : 0;
          const rowBg = rowBgFor(displayState, showFeaturedRowHighlight);
          return (
            <div
              key={name}
              style={{
                display: "flex",
                flexDirection: "row",
                height: rowHeight,
                transform: `translateY(${(rowIndexNow - domIndex) * rowHeight}px)`,
                background: rowBackgroundGradient(displayCells, width, rowBg),
                boxShadow: displayState.featured && showFeaturedRowHighlight ? `inset 0 0 ${leaderGlow}px rgba(245,194,0,0.55)` : "none",
                // paint order otherwise follows DOM order (fixed to the FINAL standings),
                // not current on-screen position — without this, a bystander whose final
                // slot is later in that order can paint over the mover mid-slide even while
                // the mover is visually passing directly over it. Reordering the DOM instead
                // of using z-index was tried and reverted — `domIndex` (used above for the
                // translateY offset) assumes DOM order matches `domOrder`; breaking that
                // assumption sent every reordered row to the wrong screen position entirely.
                position: "relative",
                zIndex: isMover ? 2 : localMoved ? 1 : 0,
              }}
            >
              {flashOpacity > 0 && (
                <div
                  style={{ position: "absolute", inset: 0, background: "#ffffff", opacity: flashOpacity, pointerEvents: "none" }}
                />
              )}
              {displayCells.map((cell, ci) => (
                <div
                  key={ci}
                  style={{
                    ...(cell.width ? { width: cell.width, flex: `0 0 ${cell.width}px` } : { flex: "1 1 0%", minWidth: 0 }),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: cell.align === "right" ? "flex-end" : cell.align === "center" ? "center" : "flex-start",
                    padding: cell.padding ?? "18px 26px",
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      opacity: rowIn * crossFade,
                      transform: `translateX(${(1 - rowIn) * 40}px)`,
                    }}
                  >
                    {cell.content}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  } else if (simultaneousTransition) {
    const { from, to, rowState: transitionRowState, viewportRows, rowHeight, renderCellsTo } = simultaneousTransition;
    const total = to.length;
    const maxScrollRows = Math.max(0, total - viewportRows);
    // fixed DOM/paint order for the whole animation — the final result, same
    // reasoning as the staged `positionTransition` branch (see its comment).
    const domOrder = to;
    const fromByName = new Map(from.map((r) => [r.name, r]));
    const toByName = new Map(to.map((r) => [r.name, r]));
    const fromIndexByName = new Map(from.map((r, i) => [r.name, i]));
    const toIndexByName = new Map(to.map((r, i) => [r.name, i]));

    const holdFrames = SIMULTANEOUS_TRANSITION_HOLD_SECONDS * fps;
    // the label flash/push announces "a new run is starting" first; the rows
    // themselves (content + slide) don't cut over until this much later —
    // two distinct beats, not one, per the "let the title change land before
    // the standings move" note.
    const labelLeadFrames = SIMULTANEOUS_TRANSITION_LABEL_LEAD_SECONDS * fps;
    const contentCutoverFrame = holdFrames + labelLeadFrames;
    const slideFrames = SIMULTANEOUS_TRANSITION_SLIDE_SECONDS * fps;
    const rawT = clamp((frame - contentCutoverFrame) / slideFrames, 0, 1);
    // same smoothstep ease as the staged branch — a linear slide reads mechanically.
    const t = rawT * rawT * (3 - 2 * rawT);
    const contentRevealed = frame >= contentCutoverFrame;

    // the label swaps at `holdFrames` — well before `contentRevealed` (rows'
    // own cutover) — so the "run N" announcement always lands first.
    resolvedRunLabel = frame >= holdFrames ? simultaneousTransition.toRunLabel : simultaneousTransition.fromRunLabel;
    prevRunLabel = simultaneousTransition.fromRunLabel;
    runLabelProgress = labelPushProgress(frame - holdFrames);
    runLabelFlash = flashPulse(frame - holdFrames);

    // no single mover to spotlight (everyone moves together), so there's no
    // per-turn camera-follow — instead pan once, in sync with the row slide,
    // between wherever the featured racers sit in `from` vs. `to`. Falls
    // back to 0 (no scroll) when there's no featured racer or the whole
    // field already fits the viewport (maxScrollRows === 0) — true for any
    // roster small enough not to need scrolling in the first place.
    const centerOffset = Math.floor((viewportRows - 1) / 2);
    const featuredNames = from.filter((r) => transitionRowState(r).featured).map((r) => r.name);
    const avgIndex = (indexByName: Map<string, number>, names: string[]) => {
      if (names.length === 0) return 0;
      const idxs = names.map((n) => indexByName.get(n) ?? 0);
      return idxs.reduce((a, b) => a + b, 0) / idxs.length;
    };
    const camFrom = clamp(avgIndex(fromIndexByName, featuredNames) - centerOffset, 0, maxScrollRows);
    const camTo = clamp(avgIndex(toIndexByName, featuredNames) - centerOffset, 0, maxScrollRows);
    scrollY = lerp(camFrom, camTo, t) * rowHeight;

    table = (
      <div
        style={{
          width: "100%",
          background: "rgba(0,0,0,0.82)",
          transform: `translateY(${-scrollY}px)`,
        }}
      >
        {domOrder.map((finalRow, domIndex) => {
          const name = finalRow.name;
          const fi = fromIndexByName.get(name) ?? domIndex;
          const ti = toIndexByName.get(name) ?? domIndex;
          const moved = fi !== ti;
          // every row interpolates continuously from its `from`-slot to its
          // `to`-slot, all on the same shared clock — unlike the staged
          // branch (one mover at a time through a static backdrop), any two
          // rows swapping ranks are BOTH in motion at once and cross paths
          // directly, which reads as overlapping text without help. Same
          // raised-cosine dip the staged branch uses to hide its discrete
          // snaps: every MOVING row (not just the ones that happen to
          // physically overlap another) dips together around the shared
          // midpoint, since they're all on the same clock anyway — covering
          // the crossing rather than tracking which specific pairs overlap.
          const rowIndexNow = lerp(fi, ti, t);
          const crossFade = moved ? 1 - 0.92 * ((1 - Math.cos(2 * Math.PI * t)) / 2) : 1;

          const contentRow = (contentRevealed ? toByName.get(name) : fromByName.get(name)) ?? finalRow;
          const displayState = transitionRowState(contentRow);
          const cellsFn = contentRevealed && renderCellsTo ? renderCellsTo : renderCells;
          const displayCells = cellsFn(contentRow, contentRevealed ? ti : fi, displayState);

          // entrance stagger keys off the pre-commit (`from`) slot — what's
          // actually on screen at frame 0, before anything has moved.
          const rowDelay = 6 + (total - 1 - fi) * 5;
          const rowIn = enterAnimation
            ? spring({ fps, frame: frame - rowDelay, config: { damping: 200 }, durationInFrames: 16 })
            : 1;
          const rowBg = rowBgFor(displayState, showFeaturedRowHighlight);
          return (
            <div
              key={name}
              style={{
                display: "flex",
                flexDirection: "row",
                height: rowHeight,
                transform: `translateY(${(rowIndexNow - domIndex) * rowHeight}px)`,
                background: rowBackgroundGradient(displayCells, width, rowBg),
                boxShadow: displayState.featured && showFeaturedRowHighlight ? `inset 0 0 ${leaderGlow}px rgba(245,194,0,0.55)` : "none",
                position: "relative",
                // the dip applies to the WHOLE row (background included, not
                // just its text) — two solid-colored boxes overlapping mid-
                // crossing is as much of the mess as the text is.
                opacity: crossFade,
                // rows actually moving paint above stationary ones during any
                // mid-slide overlap — same DOM-order-plus-transform approach
                // as the staged branch, just without a per-mover spotlight.
                zIndex: moved ? 1 : 0,
              }}
            >
              {displayCells.map((cell, ci) => (
                <div
                  key={ci}
                  style={{
                    ...(cell.width ? { width: cell.width, flex: `0 0 ${cell.width}px` } : { flex: "1 1 0%", minWidth: 0 }),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: cell.align === "right" ? "flex-end" : cell.align === "center" ? "center" : "flex-start",
                    padding: cell.padding ?? "18px 26px",
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      opacity: rowIn,
                      transform: `translateX(${(1 - rowIn) * 40}px)`,
                    }}
                  >
                    {cell.content}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  } else {
    if (scroll) {
      const hold = (scroll.holdSeconds ?? 4) * fps;
      const transition = (scroll.transitionSeconds ?? 0.8) * fps;
      const inputRange = [0];
      const outputRange = [scroll.stops[0]];
      let t = 0;
      if (scroll.holdAtStart ?? true) {
        t = hold;
        inputRange.push(t);
        outputRange.push(scroll.stops[0]);
      }
      for (let s = 1; s < scroll.stops.length; s++) {
        t += transition;
        inputRange.push(t);
        outputRange.push(scroll.stops[s]);
        t += hold;
        inputRange.push(t);
        outputRange.push(scroll.stops[s]);
      }
      // eased per transition segment — holds are flat (same value at both ends
      // of that segment) so the easing curve has no effect there regardless.
      const rowTop = interpolate(frame, inputRange, outputRange, {
        easing: Easing.inOut(Easing.ease),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      scrollY = rowTop * scroll.rowHeight;
    }

    const activeRows = rows ?? [];
    table = (
      <div
        style={{
          width: "100%",
          background: "rgba(0,0,0,0.82)",
          ...(scroll ? { transform: `translateY(${-scrollY}px)` } : {}),
        }}
      >
        {activeRows.map((row, i) => {
          const state = rowState ? rowState(row, i) : { featured: false, leader: false };
          // bottom row in first, working up to the leader last — builds suspense for
          // who's on top, and means whichever window is on screen first (usually
          // anchored near the bottom of the roster) is never left blank while it waits
          // for its turn.
          const rowDelay = 6 + (activeRows.length - 1 - i) * 5;
          const rowIn = enterAnimation
            ? spring({
                fps,
                frame: frame - rowDelay,
                config: { damping: 200 },
                durationInFrames: 16,
              })
            : 1;
          // every row shares one backdrop tone across ALL its cells (not "transparent"
          // for the normal columns vs. gray for just the endcap) — that's what keeps
          // the endcap from reading as a seam: it's the same family, just more saturated.
          const rowBg = rowBgFor(state, showFeaturedRowHighlight);
          const cells = renderCells(row, i, state);
          return (
            <div
              key={row.pos}
              style={{
                display: "flex",
                flexDirection: "row",
                height: scroll?.rowHeight,
                background: rowBackgroundGradient(cells, width, rowBg),
                // inset, not outer — an outer glow bleeds past the row's own box into
                // the row below, which is exactly the seam/"border" that kept showing up.
                // only the featured row pulses — "leader" still gets a full green row,
                // just without the animated glow, so the two emphasis states read distinctly.
                boxShadow: state.featured && showFeaturedRowHighlight ? `inset 0 0 ${leaderGlow}px rgba(245,194,0,0.55)` : "none",
              }}
            >
              {cells.map((cell, ci) => (
                <div
                  key={ci}
                  style={{
                    ...(cell.width ? { width: cell.width, flex: `0 0 ${cell.width}px` } : { flex: "1 1 0%", minWidth: 0 }),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: cell.align === "right" ? "flex-end" : cell.align === "center" ? "center" : "flex-start",
                    padding: cell.padding ?? "18px 26px",
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      opacity: rowIn,
                      transform: `translateX(${(1 - rowIn) * 40}px)`,
                    }}
                  >
                    {cell.content}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  const viewport = scroll ?? positionTransition ?? simultaneousTransition;
  const hasTitleBar = Boolean(title) || Boolean(resolvedRunLabel);
  const showHeroRunLabel = heroRunLabel && Boolean(resolvedRunLabel);
  // `columnHeaders` collapses the title bar and the column-header strip into
  // ONE row (see its rendering below) instead of stacking both.
  const headerAreaHeight = columnHeaders ? HEADER_ROW_HEIGHT : hasTitleBar ? TITLE_HEIGHT : 0;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left,
          ...(top !== undefined ? { top } : { bottom }),
          width,
          transform: `translateX(${(1 - shown) * -slideDistance}px)`,
          fontFamily: fontStack("helvetica"),
          ...(viewport
            ? {
                height: headerAreaHeight + viewport.viewportRows * viewport.rowHeight,
              }
            : {}),
        }}
      >
        {columnHeaders ? (
          // single merged header row (see `columnHeaders` doc comment above):
          // the run-number flash/push lives in the same row as the column
          // labels now, in whichever cell has no fixed width (the "name"
          // column's slot) — everything else renders that cell's own
          // `content` (TIME/TOTAL/DIFF, etc) unchanged.
          hasTitleBar && (
            <div
              style={{
                height: HEADER_ROW_HEIGHT,
                display: "flex",
                flexDirection: "row",
                background: "#000000",
              }}
            >
              {columnHeaders.map((cell, ci) => {
                const isRunLabelSlot = !cell.width;
                return (
                  <div
                    key={ci}
                    style={{
                      ...(cell.width
                        ? { width: cell.width, flex: `0 0 ${cell.width}px` }
                        : { flex: "1 1 0%", minWidth: 0 }),
                      display: "flex",
                      alignItems: "center",
                      justifyContent:
                        cell.align === "right" ? "flex-end" : cell.align === "center" ? "center" : "flex-start",
                      padding: cell.padding ?? "0 26px",
                      boxSizing: "border-box",
                      overflow: "hidden",
                      position: isRunLabelSlot ? "relative" : undefined,
                    }}
                  >
                    {isRunLabelSlot ? (
                      <>
                        {showHeroRunLabel && runLabelFlash > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: color.core.spark.ramp[300],
                              opacity: runLabelFlash * 0.45,
                              pointerEvents: "none",
                            }}
                          />
                        )}
                        {showHeroRunLabel ? (
                          // same push transition as the standalone title bar
                          // below, just left-aligned within this narrower
                          // flex slot instead of centered across the full board.
                          <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
                            {prevRunLabel && (
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  color: color.core.spark.ramp[500],
                                  fontWeight: 700,
                                  fontSize: 44,
                                  letterSpacing: "0.02em",
                                  textTransform: "uppercase",
                                  transform: `translateY(${runLabelProgress * HEADER_ROW_HEIGHT}px)`,
                                }}
                              >
                                {prevRunLabel}
                              </div>
                            )}
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                color: color.core.spark.ramp[500],
                                fontWeight: 700,
                                fontSize: 44,
                                letterSpacing: "0.02em",
                                textTransform: "uppercase",
                                transform: `translateY(${(runLabelProgress - 1) * HEADER_ROW_HEIGHT}px)`,
                              }}
                            >
                              {resolvedRunLabel}
                            </div>
                          </div>
                        ) : (
                          <span
                            style={{
                              color: "#ffffff",
                              fontWeight: 700,
                              fontSize: 24,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            {title}
                          </span>
                        )}
                      </>
                    ) : (
                      cell.content
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          hasTitleBar && (
            <div
              style={{
                height: TITLE_HEIGHT,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: showHeroRunLabel ? "center" : "space-between",
                gap: 24,
                background: "#000000",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: showHeroRunLabel ? 44 : 24,
                letterSpacing: showHeroRunLabel ? "0.02em" : "0.08em",
                textTransform: "uppercase",
                padding: "0 30px",
              }}
            >
              {showHeroRunLabel && runLabelFlash > 0 && (
                // behind the label (painted first, before the wrapper below),
                // not over it — a glow, not an overlay that'd obscure the text.
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    // ramp[100] (the lightest step) read as basically white on
                    // real footage — ramp[300] is a real, readable yellow while
                    // still lighter than the ramp[500] used for the label text
                    // itself. Lower peak opacity too — "flash, not as flashy".
                    background: color.core.spark.ramp[300],
                    opacity: runLabelFlash * 0.45,
                    pointerEvents: "none",
                  }}
                />
              )}
              {showHeroRunLabel ? (
                // push transition: the new label slides down from above while
                // the old one is pushed down and out, both on `runLabelProgress`
                // — an odometer-style swap, not an instant cut.
                <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
                  {prevRunLabel && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: color.core.spark.ramp[500],
                        transform: `translateY(${runLabelProgress * TITLE_HEIGHT}px)`,
                      }}
                    >
                      {prevRunLabel}
                    </div>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: color.core.spark.ramp[500],
                      transform: `translateY(${(runLabelProgress - 1) * TITLE_HEIGHT}px)`,
                    }}
                  >
                    {resolvedRunLabel}
                  </div>
                </div>
              ) : (
                <>
                  <span>{title}</span>
                  {resolvedRunLabel && (
                    <span style={{ color: color.core.spark.ramp[500], whiteSpace: "nowrap" }}>{resolvedRunLabel}</span>
                  )}
                </>
              )}
            </div>
          )
        )}
        {viewport ? (
          <div style={{ height: viewport.viewportRows * viewport.rowHeight, overflow: "hidden" }}>{table}</div>
        ) : (
          table
        )}
      </div>
    </AbsoluteFill>
  );
};
