import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack } from "../theme";
import { TravelMapProps } from "./types";

const REAL_WIDTH = 1920;
const REAL_HEIGHT = 1080;
const fontFamily = fontStack("helvetica");

/**
 * A single full-bleed band pinned to the very top of the frame:
 *
 *   [ KC ][====== fill ========           ][ LAKE GARNETT ]
 *
 * The labels ARE the ends of the bar — KC is the leftmost thing on screen, the
 * destination the rightmost, and the track runs edge to edge between them. The
 * bar is exactly as tall as a label, so the whole thing reads as one continuous
 * progress bar rather than a graphic with captions attached.
 *
 * Replaces a stylized route arc through the middle of the frame, and then a
 * centred line with dots and floating chips. Per Ian both spent the middle of
 * the shot to imply a geography nobody reads off a short overlay; a top strip
 * says the same thing (two places, a distance, how far along) and leaves the
 * footage alone.
 */
const LABEL_FONT_PX = 52;
const PAD_X = 40;
const PAD_Y = 24;
const BAR_HEIGHT = LABEL_FONT_PX + PAD_Y * 2;
const BAR_Y = 0;

/** the mileage read-out sits under the bar, and is optional (`showMileage`). */
const MILEAGE_FONT_PX = 64;
const MILEAGE_GAP = 22;

const LABEL_BG = "rgba(0,0,0,0.82)";
const LABEL_TEXT = "#ffffff";

/** animate-in staging (frames). The bar and its labels are present from the
 * start; only the fill (and the mileage counting with it) animates. */
const INTRO_FRAMES = 12;
const HOLD_BEFORE_DRAW_FRAMES = 6;
const DEFAULT_DRAW_SECONDS = 3.5;
const DEFAULT_HOLD_SECONDS = 1.5;

/** Canvas text measurement, so the end caps hug their copy exactly. Falls back
 * to a rough estimate during SSR, where there's no canvas. */
const measure = (text: string, fontSizePx: number) => {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d");
  if (!ctx) return text.length * fontSizePx * 0.6;
  ctx.font = `700 ${fontSizePx}px ${fontFamily}`;
  return ctx.measureText(text).width;
};

/**
 * Travel-map mileage animation (spacecowboyian/oio-apex #7). A full-width
 * progress bar across the top of the frame: origin label at the far left,
 * destination at the far right, a light track between them filling with solid
 * brand yellow as the trip progresses, and an optional mileage read-out
 * underneath. Transparent background, so it composites over the driving
 * footage.
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

  // End caps hug their own copy; the track is whatever is left between them.
  const leftCapW = Math.ceil(measure(fromLabel, LABEL_FONT_PX) + PAD_X * 2);
  const rightCapW = Math.ceil(measure(toLabel, LABEL_FONT_PX) + PAD_X * 2);
  const trackX = leftCapW;
  const trackW = Math.max(0, REAL_WIDTH - leftCapW - rightCapW);

  const mileage = Math.round(interpolate(p, [0, 1], [0, miles], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const mileageText = `${mileage} MI`;
  const mileageW = Math.ceil(measure(mileageText, MILEAGE_FONT_PX) + PAD_X * 2);
  const mileageH = MILEAGE_FONT_PX + PAD_Y * 2;

  const capTextY = BAR_Y + BAR_HEIGHT / 2;

  return (
    <AbsoluteFill>
      <svg width="100%" height="100%" viewBox={`0 0 ${REAL_WIDTH} ${REAL_HEIGHT}`} style={{ position: "absolute", inset: 0 }}>
        <g opacity={introOpacity}>
          {/* unfilled track — light yellow, the full run between the caps */}
          <rect x={trackX} y={BAR_Y} width={trackW} height={BAR_HEIGHT} fill={color.core.spark.ramp[100]} />
          {/* filled portion — solid brand yellow, growing left to right */}
          <rect x={trackX} y={BAR_Y} width={trackW * p} height={BAR_HEIGHT} fill={color.core.spark.ramp[500]} />

          {/* origin cap — flush to the left edge */}
          <rect x={0} y={BAR_Y} width={leftCapW} height={BAR_HEIGHT} fill={LABEL_BG} />
          <text
            x={leftCapW / 2}
            y={capTextY}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={fontFamily}
            fontWeight={700}
            fontSize={LABEL_FONT_PX}
            fill={LABEL_TEXT}
          >
            {fromLabel}
          </text>

          {/* destination cap — flush to the right edge */}
          <rect x={REAL_WIDTH - rightCapW} y={BAR_Y} width={rightCapW} height={BAR_HEIGHT} fill={LABEL_BG} />
          <text
            x={REAL_WIDTH - rightCapW / 2}
            y={capTextY}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={fontFamily}
            fontWeight={700}
            fontSize={LABEL_FONT_PX}
            fill={LABEL_TEXT}
          >
            {toLabel}
          </text>

          {/* mileage read-out, centred under the bar */}
          {showMileage && (
            <g transform={`translate(${REAL_WIDTH / 2}, ${BAR_Y + BAR_HEIGHT + MILEAGE_GAP + mileageH / 2})`}>
              <rect x={-mileageW / 2} y={-mileageH / 2} width={mileageW} height={mileageH} fill={LABEL_BG} />
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={fontFamily}
                fontWeight={700}
                fontSize={MILEAGE_FONT_PX}
                fill={LABEL_TEXT}
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
