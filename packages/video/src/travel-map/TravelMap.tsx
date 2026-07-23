import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, withAlpha } from "../theme";
import { TravelMapProps } from "./types";

const REAL_WIDTH = 1920;
const REAL_HEIGHT = 1080;
const fontFamily = fontStack("helvetica");

/**
 * One continuous full-bleed bar pinned to the very top of the frame:
 *
 *   KC ▓▓▓▓▓▓▓▓ 34 MI                            LAKE GARNETT
 *   └─ solid fill ─┘└──── light track ──────────────────────┘
 *
 * There are no boxes and no dots — a single yellow line runs edge to edge and
 * everything else is black type sitting on it. The heavier yellow is the
 * "meter" filling left to right; the mileage rides its leading edge, right
 * aligned just inside it, counting up as it travels.
 *
 * Earlier passes were a stylized route arc, then a centred line with dots and
 * floating label chips. Per Ian both spent the middle of the frame to imply a
 * geography nobody reads off a short overlay, and the chips fought the line
 * instead of being part of it.
 */
const LABEL_FONT_PX = 52;

/** one step down the brand type scale from the end labels (h2, 2.875rem) —
 * the mileage is a read-out riding the meter, not a peer of the place names,
 * so it sits back a notch. Centred both ways inside its own block. */
const MILEAGE_FONT_PX = 46;

const PAD_X = 40;
const PAD_Y = 24;
const BAR_HEIGHT = LABEL_FONT_PX + PAD_Y * 2;
const BAR_Y = 0;

/** clearance kept between the traveling mileage and either end label. */
const LABEL_GAP = 28;

/** black type on yellow — the bar carries its own contrast, so the end labels
 * need no plate behind them. */
const TYPE_COLOR = color.base.black;

/** the brand yellow, and the same yellow at half opacity for the unfilled run. */
const METER_FILL = color.core.spark.ramp[500];
const TRACK_FILL = withAlpha(METER_FILL, 0.5);

/** animate-in staging (frames). The bar and both end labels are present from
 * the start; only the fill (and the mileage riding it) animates. */
const INTRO_FRAMES = 12;
const HOLD_BEFORE_DRAW_FRAMES = 6;
const DEFAULT_DRAW_SECONDS = 3.5;
const DEFAULT_HOLD_SECONDS = 1.5;

/** Canvas text measurement, so the mileage can be kept clear of the end labels.
 * Falls back to a rough estimate during SSR, where there's no canvas. */
const measure = (text: string, fontSizePx: number) => {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d");
  if (!ctx) return text.length * fontSizePx * 0.6;
  ctx.font = `700 ${fontSizePx}px ${fontFamily}`;
  return ctx.measureText(text).width;
};

/**
 * Travel-map mileage animation (spacecowboyian/oio-apex #7). A full-bleed
 * progress bar across the top of the frame: origin at the far left,
 * destination at the far right, a light yellow track filling with solid brand
 * yellow as the trip progresses, and the mileage counting up as it rides the
 * fill's leading edge. Transparent background, so it composites over the
 * driving footage.
 *
 * The fill takes `drawSeconds`, so the overlay paces against whatever length of
 * B-roll it sits on.
 */
export const TravelMap: React.FC<TravelMapProps> = ({
  fromLabel,
  toLabel,
  miles,
  drawSeconds = DEFAULT_DRAW_SECONDS,
  showMileage = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const drawStart = INTRO_FRAMES + HOLD_BEFORE_DRAW_FRAMES;
  const drawEnd = drawStart + Math.max(1, Math.round(drawSeconds * fps));

  const introOpacity = interpolate(frame, [0, INTRO_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const p = interpolate(frame, [drawStart, drawEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const fillW = REAL_WIDTH * p;
  const textY = BAR_Y + BAR_HEIGHT / 2;

  const mileage = Math.round(interpolate(p, [0, 1], [0, miles], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const mileageText = `${mileage} MI`;

  // The mileage rides the meter's leading edge in its own black block, right
  // aligned so the block's trailing edge tracks the fill. Clamped at both ends
  // so it can't collide with the end labels: the fill starts at zero width
  // (which would put it over the origin label) and finishes at full width
  // (which would put it over the destination).
  const mileageBoxW = Math.ceil(measure(mileageText, MILEAGE_FONT_PX) + PAD_X * 2);
  const leftBound = PAD_X + measure(fromLabel, LABEL_FONT_PX) + LABEL_GAP + mileageBoxW;
  const rightBound = REAL_WIDTH - PAD_X - measure(toLabel, LABEL_FONT_PX) - LABEL_GAP;
  const mileageRightX = Math.min(Math.max(fillW, leftBound), Math.max(rightBound, leftBound));

  return (
    <AbsoluteFill>
      <svg width="100%" height="100%" viewBox={`0 0 ${REAL_WIDTH} ${REAL_HEIGHT}`} style={{ position: "absolute", inset: 0 }}>
        <g opacity={introOpacity}>
          {/* the line itself — the SAME yellow at half opacity, full bleed edge
              to edge. A transparency rather than a separate light ramp step, so
              the unfilled run is literally the filled colour knocked back (and
              the footage underneath reads through it). */}
          <rect x={0} y={BAR_Y} width={REAL_WIDTH} height={BAR_HEIGHT} fill={TRACK_FILL} />
          {/* the meter — full-strength yellow, filling left to right */}
          <rect x={0} y={BAR_Y} width={fillW} height={BAR_HEIGHT} fill={METER_FILL} />

          {/* origin — black type on the line, flush left */}
          <text
            x={PAD_X}
            y={textY}
            textAnchor="start"
            dominantBaseline="central"
            fontFamily={fontFamily}
            fontWeight={700}
            fontSize={LABEL_FONT_PX}
            fill={TYPE_COLOR}
          >
            {fromLabel}
          </text>

          {/* destination — black type on the line, flush right */}
          <text
            x={REAL_WIDTH - PAD_X}
            y={textY}
            textAnchor="end"
            dominantBaseline="central"
            fontFamily={fontFamily}
            fontWeight={700}
            fontSize={LABEL_FONT_PX}
            fill={TYPE_COLOR}
          >
            {toLabel}
          </text>

          {/* mileage — yellow type in a black block that bleeds the bar's full
              height, riding the meter's leading edge and counting up. Reads as
              a marker capping the fill rather than a caption on it. */}
          {showMileage && (
            <g>
              <rect
                x={mileageRightX - mileageBoxW}
                y={BAR_Y}
                width={mileageBoxW}
                height={BAR_HEIGHT}
                fill={color.base.black}
              />
              <text
                x={mileageRightX - mileageBoxW / 2}
                y={textY}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={fontFamily}
                fontWeight={700}
                fontSize={MILEAGE_FONT_PX}
                fill={METER_FILL}
              >
                {mileageText}
              </text>
            </g>
          )}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

/** total frame count: intro + hold + the caller's fill leg + a settle hold. */
export const computeTravelMapDuration = (
  holdSeconds: number = DEFAULT_HOLD_SECONDS,
  drawSeconds: number = DEFAULT_DRAW_SECONDS,
  fps = 30,
): number => Math.ceil(INTRO_FRAMES + HOLD_BEFORE_DRAW_FRAMES + drawSeconds * fps + holdSeconds * fps);
