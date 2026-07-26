import React, { useMemo } from "react";
import { Easing, interpolate } from "remotion";
import { color, fontStack } from "../theme";
import { PartLine, PartsListConfig } from "./types";
import { PartsLayout, TEAR_DEPTH, tearTeeth } from "./layout";
import { budgetStateFor, formatMoney, splitMoney } from "./money";
import { SCRIPT_STACK } from "./scriptFont";
import { CENTS_PULL, CENTS_SCALE, FIGURE_TRACKING, fitFigure } from "./fitFigure";

/** ink and paper. Everything here is a token — nothing eyeballed. */
const PAPER = color.neutral.white;
const INK = color.base.black;
const INK_DIM = color.neutral.muted2;
const CELL_BORDER = color.neutral.gray100;
const UNDER_FIG = color.support.flag.ramp[500];
const UNDER_TEXT = color.support.flag.ramp[700];
const OVER_FIG = color.core.grit.ramp[500];
const OVER_TEXT = color.core.grit.ramp[700];

/** the crumple filter's id. Fixed rather than generated — Remotion needs
 * determinism, and two identical filters sharing an id is harmless. */
const CRUMPLE_ID = "oio-parts-crumple";

/**
 * Cut clean across the top, torn off along the bottom: the roll was cut at the
 * printer and the tail was ripped. The teeth are removed from the sheet's own
 * shape via clip-path rather than painted in a background colour — the sheet
 * floats over footage, so painted teeth would be opaque blocks sitting on the
 * shot. `drop-shadow` (not `box-shadow`) for the same reason: it follows the
 * clipped alpha, so the shadow tracks the rip, and a box-shadow would be
 * clipped away by the clip-path anyway.
 */
const tearClipPath = (teeth: number): string => {
  const step = 100 / teeth;
  const pts: string[] = ["0 0", "100% 0"];
  for (let j = teeth - 1; j >= 0; j--) {
    pts.push(`${(j * step + step).toFixed(3)}% calc(100% - ${TEAR_DEPTH}px)`);
    pts.push(`${(j * step + step / 2).toFixed(3)}% 100%`);
  }
  pts.push(`0 calc(100% - ${TEAR_DEPTH}px)`);
  return `polygon(${pts.join(", ")})`;
};

/** What the sheet shows on a given frame. Everything the component draws is a
 * pure function of this, which is what makes the render frame-exact. */
export type ReceiptState = {
  /** lines printed so far */
  printed: number;
  /** first line index of the batch arriving on this appearance */
  batchStart: number;
  /** one past the last line of that batch */
  batchEnd: number;
  /** row index the window sits at, fractional while travelling */
  windowTop: number;
  /** the figure currently on the total */
  total: number;
  /** 1 = fully enlarged, 0 = settled */
  emphasis: number;
};

const dash = (dim: boolean): React.CSSProperties => ({
  flex: "none",
  height: 0,
  borderTop: `2px dashed ${dim ? INK_DIM : INK}`,
  margin: "7px 0",
});

const Row: React.FC<{
  item: PartLine;
  index: number;
  layout: PartsLayout;
  /** 0 unprinted, 1 printed */
  shown: number;
  /** 0..1 how enlarged this line is right now */
  big: number;
}> = ({ item, index, layout, shown, big }) => {
  const m = layout.metrics;
  // Emphasis is transform-only. A real font-size change would relayout the
  // list, push every row below it, and alter the height of the total's box —
  // which the written figure is measured against. The name group scales from
  // its left edge and the amount from its right, so each stays anchored to its
  // own column and neither drifts off the paper.
  const scale = 1 + big * 0.35;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flex: "none",
        height: m.rowH,
        opacity: shown,
        fontFamily: fontStack("mono"),
      }}
    >
      <span style={{ width: m.indexWidth, flex: "none", fontSize: m.indexSize, color: INK_DIM, letterSpacing: "0.06em" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          minWidth: 0,
          transformOrigin: "left center",
          transform: `scale(${scale})`,
        }}
      >
        <span style={{ fontSize: m.nameSize, whiteSpace: "nowrap", color: INK }}>{item.part.toUpperCase()}</span>
        {item.vendor ? (
          <span style={{ fontSize: m.vendorSize, letterSpacing: "0.12em", color: INK_DIM, whiteSpace: "nowrap" }}>
            {item.vendor.toUpperCase()}
          </span>
        ) : null}
      </span>
      <span
        style={{
          marginLeft: "auto",
          fontSize: m.priceSize,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          color: INK,
          transformOrigin: "right center",
          transform: `scale(${scale})`,
        }}
      >
        {(item.est ? "≈" : "") + formatMoney(item.price)}
      </span>
    </div>
  );
};

/**
 * The sheet. Pure presentation: given a `ReceiptState` it draws that state, and
 * knows nothing about appearances or timing.
 */
export const Receipt: React.FC<{
  config: PartsListConfig;
  layout: PartsLayout;
  state: ReceiptState;
}> = ({ config, layout, state }) => {
  const m = layout.metrics;
  const budget = config.budget ?? null;
  const hasBudget = budget !== null && budget !== undefined;
  const budgetState = budgetStateFor(state.total, budget);
  const over = budgetState === "over";

  const figColor = budgetState === "none" ? INK : over ? OVER_FIG : UNDER_FIG;
  const stateTextColor = over ? OVER_TEXT : UNDER_TEXT;

  const { mark, dollars, cents } = splitMoney(state.total);
  const innerWidth = m.width - m.padSide * 2;

  // The figure is sized for the FINAL total, not the running one, so it never
  // resizes as the number counts up — a script face has no tabular figures, so
  // re-fitting per frame would make the total jitter.
  const finalTotal = config.items.reduce((s, i) => s + i.price, 0);
  const finalPieces = splitMoney(finalTotal);
  const fit = useMemo(
    () =>
      fitFigure({
        head: finalPieces.mark + finalPieces.dollars,
        cents: finalPieces.cents,
        family: SCRIPT_STACK,
        cellWidth: innerWidth,
        cellHeight: m.cellH,
        clearance: m.cellMargin,
        paperWidth: m.width,
      }),
    [finalPieces.mark, finalPieces.dollars, finalPieces.cents, innerWidth, m.cellH, m.cellMargin, m.width],
  );

  // axis runs to whichever is larger, so an overshoot is drawn to scale instead
  // of pinning a full bar — and the budget becomes a marked line once it is no
  // longer the end of the scale
  const axisMax = hasBudget ? Math.max(budget as number, finalTotal) : finalTotal;
  const fill = axisMax > 0 ? Math.min(state.total / axisMax, 1) : 0;
  const markerAt = hasBudget && (budget as number) < axisMax ? ((budget as number) / axisMax) * 100 : null;

  return (
    <div
      style={{
        position: "absolute",
        left: m.left,
        top: m.top,
        width: m.width,
        height: layout.sheetHeight,
        background: PAPER,
        display: "flex",
        flexDirection: "column",
        padding: `${m.padTop}px ${m.padSide}px ${m.padBottom}px`,
        clipPath: tearClipPath(tearTeeth(layout.orientation)),
        filter: "drop-shadow(0 16px 30px rgba(0,0,0,0.55)) drop-shadow(0 3px 7px rgba(0,0,0,0.45))",
        fontFamily: fontStack("mono"),
        color: INK,
      }}
    >
      {/* Crumpled sheet: fractal noise lit by a distant light, multiplied over
          the white so creases darken the paper without tinting it. Generated
          rather than a bitmap so it scales with the frame instead of being
          fixed-resolution — and so there is no external asset to load. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id={CRUMPLE_ID} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves={5} seed={14} result="n" />
          <feDiffuseLighting in="n" lightingColor="#ffffff" surfaceScale={3.2} result="lit">
            <feDistantLight azimuth={228} elevation={62} />
          </feDiffuseLighting>
        </filter>
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: PAPER,
          filter: `url(#${CRUMPLE_ID})`,
          mixBlendMode: "multiply",
          opacity: 0.62,
        }}
      />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div
          style={{
            flex: "none",
            display: "flex",
            height: m.colHeadH,
            fontSize: m.colHeadSize,
            letterSpacing: "0.16em",
            color: INK_DIM,
          }}
        >
          <span style={{ width: m.indexWidth, flex: "none" }}>No.</span>
          <span>Item</span>
          <span style={{ marginLeft: "auto" }}>Amount</span>
        </div>
        <div style={dash(true)} />

        {/* fixed window; the list travels inside it */}
        <div style={{ flex: "none", height: layout.visibleRows * m.rowH, overflow: "hidden", position: "relative" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              transform: `translateY(${-state.windowTop * m.rowH}px)`,
            }}
          >
            {config.items.map((item, i) => {
              const inBatch = i >= state.batchStart && i < state.batchEnd;
              return (
                <Row
                  key={`${item.part}-${i}`}
                  item={item}
                  index={i}
                  layout={layout}
                  shown={i < state.printed ? 1 : 0}
                  big={inBatch ? state.emphasis : 0}
                />
              );
            })}
          </div>
          {/* soften the window's cut edges — rows entering and leaving a hard
              clip read as popping */}
          <div
            style={{
              position: "absolute",
              inset: "0 0 auto 0",
              height: 16,
              zIndex: 2,
              background: `linear-gradient(${PAPER}, rgba(255,255,255,0))`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "auto 0 0 0",
              height: 16,
              zIndex: 2,
              background: `linear-gradient(rgba(255,255,255,0), ${PAPER})`,
            }}
          />
        </div>

        <div style={dash(true)} />

        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "baseline",
            height: m.totLabelH,
            marginTop: m.totLabelGap,
            fontFamily: fontStack("helvetica"),
            fontWeight: 700,
            fontSize: m.totLabelSize,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          <span>Total</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: fontStack("mono"),
              fontWeight: 400,
              fontSize: m.ofSize,
              letterSpacing: "0.1em",
              color: INK_DIM,
              textTransform: "none",
            }}
          >
            {state.printed} of {config.items.length} items
          </span>
        </div>

        {/* The cell is left empty for the written figure to own: centred and
            overflowing all four sides, the script writes across the full width,
            so anything sharing the cell gets written over. The label sits above
            it instead. */}
        <div
          style={{
            flex: "none",
            position: "relative",
            border: `3px solid ${CELL_BORDER}`,
            height: m.cellH,
            margin: `${m.cellMargin}px 0`,
            overflow: "visible",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(-50%, calc(-50% + ${fit.offsetY.toFixed(2)}px))`,
              fontFamily: SCRIPT_STACK,
              fontSize: fit.fontSize,
              lineHeight: 1,
              letterSpacing: `${FIGURE_TRACKING}em`,
              whiteSpace: "nowrap",
              color: figColor,
            }}
          >
            {/* the currency mark stays ink black whatever the state does */}
            <span style={{ color: INK }}>{mark}</span>
            {dollars}
            <span style={{ fontSize: `${CENTS_SCALE}em`, marginLeft: `${-CENTS_PULL}em` }}>{cents}</span>
          </span>
        </div>

        {hasBudget ? (
          <div style={{ flex: "none" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                height: m.budgetRowH,
                fontSize: m.budgetLabelSize,
                letterSpacing: "0.09em",
                color: INK_DIM,
              }}
            >
              <span>Budget</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: m.budgetValueSize,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: 0,
                  color: INK,
                }}
              >
                {formatMoney(budget as number)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                height: m.budgetRowH,
                fontSize: m.budgetLabelSize,
                letterSpacing: "0.09em",
                color: stateTextColor,
              }}
            >
              <span>{over ? "Over by" : "Remaining"}</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: m.budgetValueSize,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: 0,
                  color: stateTextColor,
                }}
              >
                {formatMoney((budget as number) - state.total)}
              </span>
            </div>
            <div
              style={{
                position: "relative",
                height: m.barH,
                border: `2px solid ${INK}`,
                marginTop: m.barGap,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  background: over ? OVER_FIG : UNDER_FIG,
                  transform: `scaleX(${fill})`,
                  transformOrigin: "left center",
                }}
              />
              {markerAt !== null ? (
                <div
                  style={{
                    position: "absolute",
                    top: -6,
                    bottom: -6,
                    left: `${markerAt}%`,
                    width: 3,
                    background: INK,
                    zIndex: 2,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: -20,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      color: INK,
                      whiteSpace: "nowrap",
                    }}
                  >
                    BUDGET
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/** shared easing for the window's travel and the count-up */
export const TRAVEL_EASING = Easing.bezier(0.33, 0.68, 0.3, 1);
export const easeOutCubic = Easing.bezier(0.22, 0.61, 0.36, 1);

/** `interpolate` with both ends clamped — the default extrapolates, which would
 * run the scroll past its target on the hold frames either side. */
export const ramp = (frame: number, from: number, to: number, a: number, b: number, easing = TRAVEL_EASING): number => {
  // A zero-length beat is normal, not an error: an appearance whose new lines
  // already fit the window has no travel to do, so its scroll ramp is
  // [36, 36]. `interpolate` throws on a non-increasing input range, so collapse
  // it to the settled value instead — this is what crashed the first-appearance
  // story before Playwright caught it.
  if (to <= from) return frame < from ? a : b;
  return interpolate(frame, [from, to], [a, b], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
};
