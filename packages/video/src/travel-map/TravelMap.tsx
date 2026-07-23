import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { color, fontStack } from "../theme";
import { TravelMapProps } from "./types";

const REAL_WIDTH = 1920;
const REAL_HEIGHT = 1080;
const fontFamily = fontStack("helvetica");

/**
 * Route geometry (spacecowboyian/oio-apex #7). Real-world checked: Lake Garnett
 * (Garnett, KS) is ~77 driving miles southwest of Kansas City — KC sits
 * north/northeast, Garnett south/southwest — so the dots aren't an arbitrary
 * arc. A quadratic Bézier stands in for the route (the stylized-arc first cut;
 * real road routing is an open decision). Origin = KC, destination = Garnett;
 * `PC` is the curve's control point.
 */
const ORIGIN = { x: 1360, y: 180 };
const CONTROL = { x: 1040, y: 520 };
const DEST = { x: 440, y: 920 };
const ROUTE_D = `M ${ORIGIN.x} ${ORIGIN.y} Q ${CONTROL.x} ${CONTROL.y} ${DEST.x} ${DEST.y}`;

/** point on the quadratic Bézier at parameter t (0 = origin, 1 = destination).
 * Used to ride the traveling marker along the route — t approximates arc
 * fraction closely enough on this gentle curve that it tracks the drawn line's
 * leading edge without a full arc-length reparameterization. */
const routePoint = (t: number) => {
  const mt = 1 - t;
  return {
    x: mt * mt * ORIGIN.x + 2 * mt * t * CONTROL.x + t * t * DEST.x,
    y: mt * mt * ORIGIN.y + 2 * mt * t * CONTROL.y + t * t * DEST.y,
  };
};

/** animate-in staging (30fps). Origin dot + planned dashed route + origin label
 * fade in first; then the solid line draws origin→destination while the mileage
 * counts off; then a hold on the completed route. */
const INTRO_FRAMES = 20;
const HOLD_BEFORE_DRAW_FRAMES = 10;
const DRAW_FRAMES = 100;
const DEFAULT_HOLD_SECONDS = 1.5;

const CHIP_BG = "rgba(0,0,0,0.72)";

/** the same "little label" chip the mileage callout uses — translucent black,
 * white text, sized to the copy, text at the box's true center — reused for the
 * origin/destination point labels too, per Ian (rather than stroke-outlined
 * bare text). */
const MapChip: React.FC<{ text: string; cx: number; cy: number; fontSizePx: number; opacity: number }> = ({
  text,
  cx,
  cy,
  fontSizePx,
  opacity,
}) => {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d");
  if (ctx) ctx.font = `700 ${fontSizePx}px ${fontFamily}`;
  const textWidth = ctx ? ctx.measureText(text).width : text.length * fontSizePx * 0.6;
  const padX = 40;
  const padY = 24;
  const w = Math.ceil(textWidth + padX * 2);
  const h = Math.ceil(fontSizePx + padY * 2);
  return (
    <g transform={`translate(${cx}, ${cy})`} opacity={opacity}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={CHIP_BG} />
      <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fontFamily={fontFamily} fontWeight={700} fontSize={fontSizePx} fill="white">
        {text}
      </text>
    </g>
  );
};

/**
 * Travel-map mileage animation (spacecowboyian/oio-apex #7). The route line
 * draws from origin to destination while the mileage counts off — the classic
 * travel-map trope — over a transparent background so it composites over the
 * driving footage (or an illustrated map base, Ian's call). The planned route
 * shows first as a faint dashed arc; a solid brand-accent line then draws along
 * it behind a traveling marker, the destination dot and label arrive as the
 * line reaches them, and the mileage ticks 0→`miles` in sync.
 *
 * Deliberately the overview depiction Ian wanted to "start off with" — the
 * zoom-in-on-origin-then-follow-the-line camera variant, real road routing, and
 * a real/illustrated map base are all still open (see types.ts).
 */
export const TravelMap: React.FC<TravelMapProps> = ({ fromLabel, toLabel, miles }) => {
  const frame = useCurrentFrame();

  const drawStart = INTRO_FRAMES + HOLD_BEFORE_DRAW_FRAMES;
  const drawEnd = drawStart + DRAW_FRAMES;

  const introOpacity = interpolate(frame, [0, INTRO_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const p = interpolate(frame, [drawStart, drawEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const destOpacity = interpolate(p, [0.8, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const markerOpacity = interpolate(p, [0, 0.03, 0.92, 1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const mileageOpacity = interpolate(frame, [drawStart, drawStart + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const marker = routePoint(p);
  const mileage = Math.round(interpolate(p, [0, 1], [0, miles], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  return (
    <AbsoluteFill>
      <svg width="100%" height="100%" viewBox={`0 0 ${REAL_WIDTH} ${REAL_HEIGHT}`} style={{ position: "absolute", inset: 0 }}>
        {/* planned route — faint dashed arc, shown from the start */}
        <path
          d={ROUTE_D}
          fill="none"
          stroke={color.core.grit.ramp[300]}
          strokeWidth={12}
          strokeDasharray="32 24"
          opacity={introOpacity * 0.55}
        />
        {/* traveled route — solid brand-accent line drawing on behind the marker */}
        <path
          d={ROUTE_D}
          fill="none"
          stroke={color.core.spark.ramp[500]}
          strokeWidth={12}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - p}
        />
        {/* origin dot (white, from the start) */}
        <circle cx={ORIGIN.x} cy={ORIGIN.y} r={24} fill="white" stroke="black" strokeWidth={8} opacity={introOpacity} />
        {/* destination dot (arrives as the line reaches it) */}
        <circle cx={DEST.x} cy={DEST.y} r={24} fill={color.core.grit.ramp[300]} stroke="white" strokeWidth={8} opacity={destOpacity} />
        {/* traveling marker */}
        <circle cx={marker.x} cy={marker.y} r={18} fill={color.core.spark.ramp[500]} stroke="white" strokeWidth={6} opacity={markerOpacity} />

        <MapChip text={fromLabel} cx={ORIGIN.x} cy={ORIGIN.y - 76} fontSizePx={52} opacity={introOpacity} />
        <MapChip text={toLabel} cx={DEST.x} cy={DEST.y + 92} fontSizePx={52} opacity={destOpacity} />
        <MapChip text={`${mileage} MI`} cx={900} cy={552} fontSizePx={72} opacity={mileageOpacity} />
      </svg>
    </AbsoluteFill>
  );
};

/** total frame count: intro + hold + draw + a settle hold on the finished route. */
export const computeTravelMapDuration = (holdSeconds: number = DEFAULT_HOLD_SECONDS, fps = 30): number =>
  Math.ceil(INTRO_FRAMES + HOLD_BEFORE_DRAW_FRAMES + DRAW_FRAMES + holdSeconds * fps);
