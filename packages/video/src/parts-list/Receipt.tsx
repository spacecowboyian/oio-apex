import React, { useMemo } from "react";
import { color, fontStack } from "../theme";
import { PartLine, PartsListConfig } from "./types";
import { ReceiptState } from "./choreography";
import { PartsLayout, TEAR_DEPTH, tearTeeth } from "./layout";
import { budgetStateFor, formatMoney, netTo, splitMoney } from "./money";
import { SCRIPT_STACK } from "./scriptFont";
import { FIGURE_TRACKING, fitFigure } from "./fitFigure";

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

const dash = (dim: boolean): React.CSSProperties => ({
  flex: "none",
  height: 0,
  borderTop: `2px dashed ${dim ? INK_DIM : INK}`,
  margin: "7px 0",
});

/** How far a landing line drops in from, as a share of its own row height. */
const ARRIVAL_RISE = 0.4;

/** the pen that crosses a line off */
const STRIKE_INK = color.core.grit.ramp[500];

/**
 * A crossing-off stroke. Hand-drawn rather than a `line-through`: the sheet is
 * a physical object in the shot, so the correction reads as pen on paper, and a
 * text-decoration would also break at the gap between the name group and the
 * amount instead of running the width of the line.
 *
 * `pathLength={1}` normalises the path so the dash offset is a straight 0..1
 * progress regardless of the actual geometry — that is what lets the stroke be
 * DRAWN ON as the line is struck rather than appearing whole.
 */
const Strike: React.FC<{ width: number; height: number; progress: number }> = ({ width, height, progress }) => {
  const y = height * 0.52;
  // a real pen overshoots both ends and does not travel perfectly level
  const d = `M -6 ${y + 3.5} C ${width * 0.25} ${y - 4.5}, ${width * 0.4} ${y + 3}, ${width * 0.62} ${y - 1.5} S ${width * 0.86} ${y + 2.5}, ${width + 7} ${y - 2.5}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
      aria-hidden
    >
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke={STRIKE_INK}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
      />
    </svg>
  );
};

const Row: React.FC<{
  item: PartLine;
  layout: PartsLayout;
  /** 0 not on the sheet, 1 fully arrived, in between while landing */
  arrival: number;
  /** 0 not struck, 1 fully crossed off */
  struck: number;
}> = ({ item, layout, arrival, struck }) => {
  const m = layout.metrics;
  // A struck line drops back to the sheet's secondary ink as it is crossed off,
  // so the lines that still count carry the receipt. Ian's pick of three
  // treatments (2026-07-27): the pen stroke alone left a voided line competing
  // with live ones at equal weight, and a machine-straight rule fought the
  // physical-object read the crumple and the torn edge commit to.
  const rowInk = struck > 0.5 ? INK_DIM : INK;
  // The entrance is VERTICAL AND OPACITY ONLY, and never touches width — see
  // ReceiptState.arrival for why an enlargement is not available here. Nor may
  // it change font size: that would relayout the list, push every row below it,
  // and alter the height of the total's box, which the written figure is
  // measured against.
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flex: "none",
        height: m.rowH,
        opacity: arrival,
        transform: `translateY(${(1 - arrival) * m.rowH * ARRIVAL_RISE}px)`,
        fontFamily: fontStack("mono"),
        position: "relative",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Both of these may be truncated, but the vendor gives way FIRST — a
            supplier is worth losing before a part name is. That priority is a
            hard cap on the vendor's share rather than a shrink ratio: shrink is
            proportional to factor × content width, so a long enough vendor eats
            into the name no matter how the factors are set, which is exactly
            what it did before the cap. The name ellipsizing at all means the
            ledger carried prose where `PartLine.part` asks for a short
            on-screen name; it is the backstop, not the plan. */}
        <span
          style={{
            fontSize: m.nameSize,
            whiteSpace: "nowrap",
            flex: "0 1 auto",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: rowInk,
          }}
        >
          {item.part.toUpperCase()}
        </span>
        {item.vendor ? (
          // The explicit `minWidth: 0` is load-bearing — flexbox defaults items
          // to `min-width: auto`, which silently prevents `text-overflow` from
          // ever engaging (the same bug the leaderboard's name column hit, and
          // one no CLI render can catch).
          <span
            style={{
              fontSize: m.vendorSize,
              letterSpacing: "0.12em",
              color: INK_DIM,
              whiteSpace: "nowrap",
              flex: "0 1 auto",
              maxWidth: m.vendorMaxWidth,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.vendor.toUpperCase()}
          </span>
        ) : null}
      </span>
      <span
        style={{
          marginLeft: "auto",
          paddingLeft: 16,
          flex: "none",
          fontSize: m.priceSize,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          color: rowInk,
        }}
      >
        {(item.est ? "≈" : "") + formatMoney(item.price)}
      </span>
      {struck > 0 ? (
        <Strike width={m.width - m.padSide * 2} height={m.rowH} progress={struck} />
      ) : null}
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

  const { mark, dollars } = splitMoney(state.total);
  const innerWidth = m.width - m.padSide * 2;

  // The figure is sized for the FINAL total, not the running one, so it never
  // resizes as the number counts up — a script face has no tabular figures, so
  // re-fitting per frame would make the total jitter.
  const finalTotal = netTo(config.items, config.items.length);
  const finalPieces = splitMoney(finalTotal);
  const fit = useMemo(
    () =>
      fitFigure({
        head: finalPieces.mark + finalPieces.dollars,
        family: SCRIPT_STACK,
        cellWidth: innerWidth,
        cellHeight: m.cellH,
        clearance: m.cellMargin,
        paperWidth: m.width,
      }),
    [finalPieces.mark, finalPieces.dollars, innerWidth, m.cellH, m.cellMargin, m.width],
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
            {config.items.map((item, i) => (
              <Row
                key={`${item.part}-${i}`}
                item={item}
                layout={layout}
                arrival={state.arrival[i] ?? 0}
                struck={state.struck[i] ?? 0}
              />
            ))}
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
            {/* The currency mark never takes the budget colour — it reads as
                punctuation and the figure carries the signal. It sits in the
                sheet's SECONDARY ink rather than black (Ian 2026-07-27: black
                was "a bit too in your face" at this size): the same tone as the
                vendors and column heads, which is what a mark this large should
                weigh against a number that is the actual point. */}
            <span style={{ color: INK_DIM }}>{mark}</span>
            {dollars}
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
