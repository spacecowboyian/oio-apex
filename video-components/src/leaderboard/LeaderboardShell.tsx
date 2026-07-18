import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, withAlpha } from "../theme";
import { TITLE_HEIGHT, POSITION_TRANSITION_HOLD_SECONDS, POSITION_TRANSITION_SLIDE_SECONDS } from "./layout";

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
 * about; it always wins for the row's ambient background. `fastest` (green)
 * is computed independently — whoever currently holds the best single
 * run/lap in the field. The two are independent, not mutually exclusive: a
 * featured racer who's also currently fastest still gets a yellow row, but
 * their fast/total cell gets its own green accent (see rowCells.tsx).
 */
export type RowState = { featured: boolean; fastest: boolean };

/**
 * "Camera follow" position-change animation — one featured racer moves at a
 * time: hold, slide that racer from `steps[k]` to `steps[k+1]` (matched by
 * `name`) while the camera tracks them, hold, repeat for the next name in
 * `moverNames`. Old stat/rank text fades out as the new value fades in,
 * timed to the same slide. Mutually exclusive with `scroll` — see
 * LeaderboardShell's rendering branch below and `derivePositionSequence` in
 * runProgress.ts.
 */
export type PositionTransitionConfig<T> = {
  /** steps[0] = everyone at the earlier run; each step after that advances
   * exactly one more mover to their later time; steps[N] = final result. */
  steps: T[][];
  /** moverNames[k] is who changes between steps[k] and steps[k+1] — bottom-placed first. */
  moverNames: string[];
  stepRowState: (row: T, stepIndex: number) => RowState;
  viewportRows: number;
  rowHeight: number;
  /** run-number label (e.g. "RUN 2"), right-aligned in the title bar — swaps
   * partway through the overall sequence. */
  fromRunLabel?: string | null;
  toRunLabel?: string | null;
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
 * rows without duplicating the color rule. */
export const rowBgFor = (state: RowState) =>
  state.featured
    ? color.core.spark.ramp[700]
    : state.fastest
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
  top,
  left = 0,
  bottom = 0,
  title,
  runLabel,
  animateOut = true,
}: {
  rows?: T[];
  rowState?: (row: T, index: number) => RowState;
  renderCells: (row: T, index: number, state: RowState) => Cell[];
  width?: number;
  scroll?: ScrollConfig;
  positionTransition?: PositionTransitionConfig<T>;
  /** anchor to the top instead of the bottom — for edge-to-edge, full-frame-height boards */
  top?: number;
  /** left-edge offset — every board is full-bleed to the corner by default */
  left?: number;
  /** bottom-edge offset, only used when `top` is unset (compact mode) — full-bleed by default */
  bottom?: number;
  /** optional context row, locked to the top of the card above the scrolling table */
  title?: string | null;
  /** run-number indicator (e.g. "RUN 2", "FINAL"), right-aligned in the title
   * bar — ignored when `positionTransition` supplies its own from/to labels. */
  runLabel?: string | null;
  /** slides the board back out (mirroring the entrance) near the end of the
   * render instead of holding on its final frame. Default true. */
  animateOut?: boolean;
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
  const cardIn = spring({ fps, frame, config: { damping: 200 }, durationInFrames: DRAWER_FRAMES });
  const exitStart = durationInFrames - DRAWER_FRAMES;
  const cardOut = animateOut
    ? spring({ fps, frame: frame - exitStart, config: { damping: 200 }, durationInFrames: DRAWER_FRAMES })
    : 0;
  const shown = cardIn * (1 - cardOut);
  const slideDistance = width + Math.max(left, 0) + 60;

  let scrollY = 0;
  let table: React.ReactNode;
  let resolvedRunLabel: string | null | undefined = runLabel;

  if (positionTransition) {
    const { steps, moverNames, stepRowState, viewportRows, rowHeight } = positionTransition;
    const N = moverNames.length;
    const finalStep = steps[N];
    const total = finalStep.length;
    const maxScrollRows = Math.max(0, total - viewportRows);
    // fixed DOM/paint order (and therefore column widths) for the whole animation —
    // the final result. Where a row is drawn on screen is entirely a matter of its
    // per-frame `transform`, not DOM position.
    const domOrder = finalStep;
    // entrance stagger keys off each row's ORIGINAL (steps[0]) slot, not wherever
    // it happens to be mid-sequence — so every row, including whichever racer is
    // about to move, enters in one coherent bottom-up sweep with its neighbors.
    const initialIndexByName = new Map(steps[0].map((r, i) => [r.name, i]));

    const holdFrames = POSITION_TRANSITION_HOLD_SECONDS * fps;
    const slideFrames = POSITION_TRANSITION_SLIDE_SECONDS * fps;
    const centerOffset = Math.floor((viewportRows - 1) / 2);

    // Precompute where the camera starts and lands for each mover's own slide —
    // the building block for panning smoothly *between* movers too (see below).
    const moverInfo = moverNames.map((name, k) => {
      const fiK = steps[k].findIndex((r) => r.name === name);
      const tiK = steps[k + 1].findIndex((r) => r.name === name);
      const camStart = clamp(fiK - centerOffset, 0, maxScrollRows);
      const focusScreenSlot = fiK - camStart;
      const camEnd = clamp(tiK - focusScreenSlot, 0, maxScrollRows);
      return { fiK, tiK, focusScreenSlot, camStart, camEnd };
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

    const mover = N > 0 ? moverNames[moverIdx] : null;
    const stepFrom = N > 0 ? steps[moverIdx] : finalStep;
    const stepTo = N > 0 ? steps[moverIdx + 1] : finalStep;
    const fromIndexByName = new Map(stepFrom.map((r, i) => [r.name, i]));
    const toIndexByName = new Map(stepTo.map((r, i) => [r.name, i]));

    // camera tracks the current mover, clamping at the board's top/bottom edge
    // once there's nowhere left to scroll — the mover then keeps sliding within
    // the fixed viewport instead of the camera following it past the edge.
    let cameraTopRow: number;
    if (holdPan) {
      const p = holdPan.progress * holdPan.progress * (3 - 2 * holdPan.progress);
      cameraTopRow = lerp(holdPan.from, holdPan.to, p);
    } else if (N > 0) {
      const info = moverInfo[moverIdx];
      const moverRowNow = lerp(info.fiK, info.tiK, t);
      cameraTopRow = clamp(moverRowNow - info.focusScreenSlot, 0, maxScrollRows);
    } else {
      cameraTopRow = 0;
    }
    scrollY = cameraTopRow * rowHeight;

    // the run-number label swaps partway through the OVERALL sequence (not
    // per-step) — early movers still read as "the earlier run" until the field
    // is roughly half caught up to the later one.
    const overallT = N > 0 ? (moverIdx + t) / N : 1;
    resolvedRunLabel = overallT >= 0.5 ? positionTransition.toRunLabel : positionTransition.fromRunLabel;

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
          const isMover = name === mover;
          // only the mover actually slides continuously — a displaced bystander
          // instead holds at its old slot and snaps straight to its new one at
          // the swap point (hidden by the opacity dip below). Otherwise a
          // bystander drifting the opposite direction crosses paths with the
          // mover mid-slide, and their text visibly collides for a few frames.
          const rowIndexNow = isMover || !moved ? lerp(fi, ti, t) : t < 0.5 ? fi : ti;
          const fromRow = stepFrom.find((r) => r.name === name) ?? finalRow;
          const toRow = stepTo.find((r) => r.name === name) ?? finalRow;
          const fromState = stepRowState(fromRow, moverIdx);
          const toState = stepRowState(toRow, Math.min(moverIdx + 1, N));
          // once past the midpoint of this row's own move, its background/glow
          // switch to the "arrived" state — same beat the text content swaps on.
          const displayState = t < 0.5 ? fromState : toState;
          const fromCells = renderCells(fromRow, fi, fromState);
          const toCells = renderCells(toRow, ti, toState);
          const displayCells = t < 0.5 ? fromCells : toCells;

          const initialIdx = initialIndexByName.get(name) ?? domIndex;
          const rowDelay = 6 + (total - 1 - initialIdx) * 5;
          const rowIn = spring({ fps, frame: frame - rowDelay, config: { damping: 200 }, durationInFrames: 16 });
          // displaced bystanders dim near-invisible right around their discrete
          // slot-swap (above) — that's what hides the jump — and stay dim
          // through the rest of the crossing so the mover reads as the only
          // thing actually moving. A raised-cosine dip (smooth at both ends and
          // at its trough) rather than a linear ramp — a fast final-15% ramp
          // back to full opacity read as a "bump/flash" right as the mover landed.
          const crossFade = moved && !isMover ? 1 - 0.92 * ((1 - Math.cos(2 * Math.PI * t)) / 2) : 1;
          const rowBg = rowBgFor(displayState);
          return (
            <div
              key={name}
              style={{
                display: "flex",
                flexDirection: "row",
                height: rowHeight,
                transform: `translateY(${(rowIndexNow - domIndex) * rowHeight}px)`,
                background: rowBackgroundGradient(displayCells, width, rowBg),
                boxShadow: displayState.featured ? `inset 0 0 ${leaderGlow}px rgba(245,194,0,0.55)` : "none",
                // paint order otherwise follows DOM order (fixed to the FINAL standings),
                // not current on-screen position — without this, a bystander whose final
                // slot is later in that order can paint over the mover mid-slide even while
                // the mover is visually passing directly over it. Reordering the DOM instead
                // of using z-index was tried and reverted — `domIndex` (used above for the
                // translateY offset) assumes DOM order matches `domOrder`; breaking that
                // assumption sent every reordered row to the wrong screen position entirely.
                position: "relative",
                zIndex: isMover ? 2 : moved ? 1 : 0,
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
                  <div style={{ position: "relative" }}>
                    <div
                      style={{
                        opacity: rowIn * crossFade * (moved ? 1 - t : 1),
                        transform: `translateX(${(1 - rowIn) * 40}px)`,
                      }}
                    >
                      {fromCells[ci].content}
                    </div>
                    {moved && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          opacity: rowIn * crossFade * t,
                        }}
                      >
                        {toCells[ci].content}
                      </div>
                    )}
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
          const state = rowState ? rowState(row, i) : { featured: false, fastest: false };
          // bottom row in first, working up to the leader last — builds suspense for
          // who's on top, and means whichever window is on screen first (usually
          // anchored near the bottom of the roster) is never left blank while it waits
          // for its turn.
          const rowDelay = 6 + (activeRows.length - 1 - i) * 5;
          const rowIn = spring({
            fps,
            frame: frame - rowDelay,
            config: { damping: 200 },
            durationInFrames: 16,
          });
          // every row shares one backdrop tone across ALL its cells (not "transparent"
          // for the normal columns vs. gray for just the endcap) — that's what keeps
          // the endcap from reading as a seam: it's the same family, just more saturated.
          const rowBg = rowBgFor(state);
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
                // only the featured row pulses — "fastest" still gets a full green row,
                // just without the animated glow, so the two emphasis states read distinctly.
                boxShadow: state.featured ? `inset 0 0 ${leaderGlow}px rgba(245,194,0,0.55)` : "none",
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

  const viewport = scroll ?? positionTransition;
  const hasTitleBar = Boolean(title) || Boolean(resolvedRunLabel);

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
            ? { height: (hasTitleBar ? TITLE_HEIGHT : 0) + viewport.viewportRows * viewport.rowHeight }
            : {}),
        }}
      >
        {hasTitleBar && (
          <div
            style={{
              height: TITLE_HEIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
              background: "#000000",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "0 30px",
            }}
          >
            <span>{title}</span>
            {resolvedRunLabel && (
              <span style={{ color: color.core.spark.ramp[500], whiteSpace: "nowrap" }}>{resolvedRunLabel}</span>
            )}
          </div>
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
