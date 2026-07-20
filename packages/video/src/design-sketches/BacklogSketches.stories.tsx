import React, { useId } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { color, cornerLabel, fontStack, type } from "../theme";
import { rankCell, nameCell, endcapBgFor, endcapTextFor } from "../leaderboard/rowCells";
import { StatBlock } from "../leaderboard/RunStats";
import { RowState } from "../leaderboard/LeaderboardShell";
import { LeaderboardRow } from "../leaderboard/LeaderboardRow";
import { ConeIcon } from "../leaderboard/ConeIcon";
import { WIDTH_FOR_EVENT } from "../leaderboard/layout";
import { formatRunTime, lastOf } from "../leaderboard/time";

/**
 * Static, non-production design sketches for the visual items in the
 * video-graphics backlog (spacecowboyian/oio-apex #1, #2, #4, #5, #6, #7 —
 * #3 is the engine refactor, not a visual concept, and #8 was the audio bug).
 *
 * Deliberately NOT built for real: no Remotion, no `useCurrentFrame`/spring,
 * no Root.tsx composition, no JSON config, no batch export. Plain HTML/CSS
 * over the same reference photo the shipped stories already use, so the
 * design can be nailed down before any of this becomes real component work.
 *
 * Every sketch is built at the REAL 1920×1080 broadcast frame size, in real
 * production pixel values (the same numbers the shipped components actually
 * use — `LowerThird.tsx`'s 66px corner-label font, `padding: 64` edge inset,
 * `ROW_HEIGHT`/`WIDTH_FOR_EVENT` from the leaderboard, etc.) — not
 * approximated at preview scale. `Frame` is the one place that scales
 * anything: a single `transform: scale(...)` shrinks the whole 1920×1080
 * canvas down to fit this page, so every sketch is proportionally correct
 * against every other and against the real shipped components, instead of
 * each one guessing its own preview-scale numbers by hand (an earlier pass
 * did that per-sketch and they drifted out of proportion with each other).
 *
 * The box glyphs DO reuse the real knockout-mask technique (see
 * `KnockoutBox.tsx`) — inlined locally here rather than imported, since this
 * is sketch code, not the production engine — because an approximated (e.g.
 * flat-colored) glyph would misrepresent what the real thing looks like.
 */

const PHOTO_URL = "/betty-datsun-521.png";

const meta: Meta = {
  title: "Design Sketches/Backlog",
  parameters: { layout: "padded" },
};
export default meta;

const REAL_WIDTH = 1920;
const REAL_HEIGHT = 1080;
/** Blown up, not tucked into a small thumbnail — real 1920×1080, zoomed down
 * as one unit via CSS `zoom` (not `transform: scale`). `transform` only
 * repaints a scaled image of the box — the element's own layout size (what
 * you read in DevTools) stays the untransformed 1920×1080 value, which is
 * why a real 30px gap measured 30px regardless of the preview size. `zoom`
 * genuinely re-renders the subtree at a different scale, the way changing
 * the browser's own zoom level would — every real production pixel value in
 * this file (66, 64, 132, 950, ...) is exactly what you'll measure on screen
 * once `DISPLAY_ZOOM` is dialed to 1. */
const DISPLAY_ZOOM = 0.6;

/** filesystem/URL-safe id from a frame's label — e.g. "#6 Run HUD" -> "6-run-hud" —
 * so a specific frame can be jumped to directly via a `#`-fragment instead of
 * scrolling through the whole gallery every time. */
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** One column, one shared zoom. `children` are laid out assuming a real
 * 1920×1080 canvas — this is the only place that zooms it down to fit. Each
 * frame gets an `id` (slugified from its label) so it's addressable via a
 * URL fragment, e.g. `...#6-run-hud`. */
const Frame: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div id={slugify(label)}>
    <div
      style={{
        fontFamily: fontStack("helvetica"),
        fontSize: type.scale.caption,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: color.base.muted,
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <div
      style={
        {
          position: "relative",
          width: REAL_WIDTH,
          height: REAL_HEIGHT,
          zoom: DISPLAY_ZOOM,
          backgroundImage: `url(${PHOTO_URL})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          overflow: "hidden",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  </div>
);

/** the shared knockout technique — an SVG mask, white base (opaque) with the
 * glyph content painted black (cut to transparent) — same convention as
 * `KnockoutBox.tsx`. `children` here is whatever SVG content should be cut:
 * `<text>` for a word, or simple shapes for an icon glyph. */
const KnockoutChip: React.FC<{ width: number; height: number; boxBg: string; children: React.ReactNode }> = ({
  width,
  height,
  boxBg,
  children,
}) => {
  const id = useId();
  return (
    <svg width={width} height={height} style={{ display: "block", flexShrink: 0 }}>
      <mask id={id}>
        <rect width={width} height={height} fill="white" />
        <g fill="black">{children}</g>
      </mask>
      <rect width={width} height={height} fill={boxBg} mask={`url(#${id})`} />
    </svg>
  );
};

/** the shipped `LowerThird.tsx` corner-label font — 3x the base h5 scale —
 * reused verbatim, not re-derived, so this sketch matches the real thing. */
const FONT_PX = parseFloat(type.scale.h5) * 16 * 3;
/** the social-link chips read a little heavy at the full reference size, per Ian. */
const SOCIAL_FONT_PX = FONT_PX * 0.75;
/** venue/event tags carry much more text ("I-35 SPEEDWAY" + "WINSTON, MISSOURI",
 * "KCRX" + "JULY.19.26") than a short fact/name pair — sized down so a full
 * two-part tag fits the frame with room to spare, not just the shortest case. */
const TAG_FONT_PX = FONT_PX * 0.6;
const fontFamily = fontStack("helvetica");
/** matches `LowerThird.tsx`'s real `padding: 64` off the frame edge, verbatim. */
const EDGE_INSET = 64;

const padY = (fontSizePx: number) => 0.32 * fontSizePx;
const padX = (fontSizePx: number) => 0.55 * fontSizePx;

const wordStyle = (surface: "dark" | "light", fontSizePx: number = FONT_PX): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  lineHeight: 1,
  fontFamily,
  fontWeight: 700,
  fontSize: fontSizePx,
  padding: `${padY(fontSizePx)}px ${padX(fontSizePx)}px`,
  color: surface === "dark" ? cornerLabel.onDark.plainColor : cornerLabel.onLight.plainColor,
});

/** text-mode knockout chip, sized from the text itself — same canvas-measure
 * approach as `measureText.ts`, inlined for this sketch file. */
const TextChip: React.FC<{ text: string; surface: "dark" | "light"; fontSizePx?: number }> = ({
  text,
  surface,
  fontSizePx = FONT_PX,
}) => {
  const pY = padY(fontSizePx);
  const pX = padX(fontSizePx);
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d");
  if (ctx) ctx.font = `700 ${fontSizePx}px ${fontFamily}`;
  const textWidth = ctx ? ctx.measureText(text).width : text.length * fontSizePx * 0.6;
  const width = Math.ceil(textWidth + pX * 2);
  const height = Math.ceil(fontSizePx + pY * 2);
  const boxBg = surface === "dark" ? cornerLabel.onDark.boxBg : cornerLabel.onLight.boxBg;
  return (
    <KnockoutChip width={width} height={height} boxBg={boxBg}>
      <text x={pX} y={height / 2} dominantBaseline="central" textAnchor="start" fontFamily={fontFamily} fontWeight={700} fontSize={fontSizePx}>
        {text}
      </text>
    </KnockoutChip>
  );
};

/** icon-mode knockout chip — same mask technique as `TextChip` (that's the
 * approved look; a flat colored icon was tried and rejected). Fixed
 * `viewBox="0 0 24 24"` regardless of the box's real pixel size, so every
 * glyph below is defined in stable 0–24 coordinates and can't drift out of
 * proportion the way raw-pixel shapes did against a differently-sized box.
 * Icon "ink" is built from layered solid fills (paint a shape, then paint a
 * smaller same-shape in the opposite color on top to punch a ring), not thin
 * strokes — strokes are what read as fuzzy/broken in a luminance mask. */
const IconKnockoutChip: React.FC<{ surface: "dark" | "light"; fontSizePx?: number; children: React.ReactNode }> = ({
  surface,
  fontSizePx = FONT_PX,
  children,
}) => {
  const id = useId();
  const size = Math.ceil(fontSizePx + padY(fontSizePx) * 2);
  const boxBg = surface === "dark" ? cornerLabel.onDark.boxBg : cornerLabel.onLight.boxBg;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}>
      <mask id={id}>
        <rect x="0" y="0" width="24" height="24" fill="white" />
        {children}
      </mask>
      <rect x="0" y="0" width="24" height="24" fill={boxBg} mask={`url(#${id})`} />
    </svg>
  );
};

// accurate, recognizable brand-mark proportions in a stable 0–24 box — the
// real build swaps these for actual Font Awesome brand-icon paths (per the
// linked issue), but these are drawn carefully enough to judge scale now.
// All "ink" is solid fill layering, cut to transparent by the mask above.
/** shrinks a glyph uniformly around the box's own center (12,12) — Instagram
 * and YouTube were drawn near-full-bleed of the 24x24 box, which reads much
 * bigger than a single letterform like Facebook's "f" sitting in the same
 * box; scaling around center (not just shrinking coordinates by hand) keeps
 * everything registered to the same visual center. */
const shrink = (scale: number, node: React.ReactNode) => (
  <g transform={`translate(12,12) scale(${scale}) translate(-12,-12)`}>{node}</g>
);

const InstagramGlyph = shrink(
  0.62,
  <>
    <rect x="2" y="2" width="20" height="20" rx="5" fill="black" />
    <rect x="5" y="5" width="14" height="14" rx="3" fill="white" />
    <circle cx="12" cy="12" r="5" fill="black" />
    <circle cx="12" cy="12" r="2.6" fill="white" />
    <circle cx="17.3" cy="6.7" r="1" fill="black" />
  </>,
);

/** optical centering via real ink extent (canvas `measureText`'s
 * actualBoundingBox*), not `text-anchor`/`dominant-baseline` — those center
 * the glyph's advance box, not its visible ink, and a single asymmetric
 * letterform like "f" reads off-center anchored that way. Same technique
 * this project already uses for the circle-system glyphs (see HANDOFF.md). */
const centeredGlyph = (ch: string, fontSizePx: number, cx: number, cy: number) => {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d");
  if (ctx) ctx.font = `700 ${fontSizePx}px ${fontFamily}`;
  const m = ctx?.measureText(ch);
  const inkLeft = m?.actualBoundingBoxLeft ?? 0;
  const inkRight = m?.actualBoundingBoxRight ?? fontSizePx * 0.5;
  const inkAscent = m?.actualBoundingBoxAscent ?? fontSizePx * 0.7;
  const inkDescent = m?.actualBoundingBoxDescent ?? 0;
  const x = cx - (inkRight - inkLeft) / 2;
  const y = cy - (inkDescent - inkAscent) / 2;
  return (
    <text x={x} y={y} textAnchor="start" fontFamily={fontFamily} fontWeight={700} fontSize={fontSizePx}>
      {ch}
    </text>
  );
};
const FacebookGlyph = centeredGlyph("f", 17, 12, 12);

const YoutubeGlyph = shrink(
  0.62,
  <>
    <rect x="1.5" y="4.5" width="21" height="15" rx="4" fill="black" />
    <path d="M10 8.5 L16 12 L10 15.5 Z" fill="white" />
  </>,
);

/** the real Font Awesome Free "link" solid icon (not a hand-drawn
 * approximation — that one was "awful," per Ian), fetched verbatim from
 * fontawesome/svgs so the path data is exact, not reconstructed from memory.
 * Native viewBox 640×512; scaled/centered into this file's 0–24 icon space
 * at roughly the same visual weight as the other social glyphs (~13 units
 * wide, matching Instagram's effective ~12.4). CC BY 4.0 (Font Awesome Free
 * icons) — real build needs attribution, same open item as the cone icon. */
const LinkGlyph = (
  <g transform="translate(5.5, 6.8) scale(0.0203125)">
    <path
      fill="black"
      d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"
    />
  </g>
);

/** #1 — social-link corner label: icon swipes in, handle to follow (static rest state).
 * Style is `[icon box] / handle` — the slash sits plain (no background), same
 * as the handle word, just between the two. Sized at 75% of the reference
 * scale, per Ian — read a little heavy at full size. A plain website link
 * (not a social platform) drops the slash entirely, per Ian. */
const SocialLinkSketch: React.FC<{ glyph: React.ReactNode; handle: string; showSlash?: boolean }> = ({
  glyph,
  handle,
  showSlash = true,
}) => (
  <div
    style={{
      position: "absolute",
      left: EDGE_INSET,
      bottom: EDGE_INSET,
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    }}
  >
    <IconKnockoutChip surface="dark" fontSizePx={SOCIAL_FONT_PX}>
      {glyph}
    </IconKnockoutChip>
    {showSlash && (
      <span
        style={{
          ...wordStyle("dark", SOCIAL_FONT_PX),
          paddingLeft: padX(SOCIAL_FONT_PX) * 0.5,
          paddingRight: padX(SOCIAL_FONT_PX) * 0.5,
        }}
      >
        /
      </span>
    )}
    <span style={{ ...wordStyle("dark", SOCIAL_FONT_PX), paddingLeft: showSlash ? 0 : padX(SOCIAL_FONT_PX) }}>
      {handle}
    </span>
  </div>
);

/** #5 — venue/track tag, left-anchored: box (outer/left edge) = venue name,
 * plain word (inward) = city/state. Split out as its own frame from the
 * event date/time tag — per Ian, each is its own graphic, not a combo.
 * `surface="light"` — it sits over the sky, not the dark asphalt, so per the
 * corner-label contrast rule (decisions/oio-apex/corner-label-rule.md) it
 * needs the black-box palette, not white. No per-frame backdrop detection
 * yet (that's future work, not this sketch's job) — for now both top-corner
 * tags are just hardcoded to the light/black-box palette, per Ian: count on
 * the location/date tags landing over sky more often than not. */
const VenueTagSketch = () => (
  <div style={{ position: "absolute", left: EDGE_INSET, top: EDGE_INSET, display: "flex", flexDirection: "row", alignItems: "center" }}>
    <TextChip text="I-35 SPEEDWAY" surface="light" fontSizePx={TAG_FONT_PX} />
    <span style={wordStyle("light", TAG_FONT_PX)}>WINSTON, MISSOURI</span>
  </div>
);

/** #2 — event date/time tag, right-anchored: plain word (inward) = date,
 * box (outer/right edge) = region + discipline only (e.g. "KCRX"/"KCAX"/
 * "KSRX", no space) — no event number, per Ian ("the date says enough").
 * Date is month.day.year, 2-digit year, dot-separated — same "2-digit year
 * only" convention as the car-fact rule. `surface="light"` for the same
 * reason as the venue tag above — sky backdrop, black box. */
const EventDateSketch = () => (
  <div style={{ position: "absolute", right: EDGE_INSET, top: EDGE_INSET, display: "flex", flexDirection: "row", alignItems: "center" }}>
    <span style={wordStyle("light", TAG_FONT_PX)}>JULY.19.26</span>
    <TextChip text="KCRX" surface="light" fontSizePx={TAG_FONT_PX} />
  </div>
);

/** #4 — burned-in caption card, replacing the SCCA/explainer CTA (dropped —
 * per Ian, not needed). For dialogue that's hard to hear: forced captions,
 * one line, hugging the text (not full-width) — the brand guide's
 * translucent-black-box move, but sized for actual caption legibility, not
 * hero/CTA emphasis. Sized to read clearly on both a phone and a TV without
 * being "ginormous" — noticeably smaller than the CTA card's h4 (that was
 * the complaint), landing near the brand's h2/h3 body-caption range. */
const CAPTION_FONT_PX = 72;
const CaptionCardSketch = () => (
  <div
    style={{
      position: "absolute",
      left: "50%",
      bottom: 80,
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.72)",
      color: "white",
      padding: "28px 64px",
      fontFamily,
      fontWeight: 700,
      fontSize: CAPTION_FONT_PX,
      whiteSpace: "nowrap",
    }}
  >
    Yeah and then I ran right into that cow.
  </div>
);

/** native viewBox is 110×135 (0.815 aspect); width derived to keep the source
 * proportions intact. Real production size — 4x the earlier preview-scale
 * guess, matching this file's move to real 1920×1080 coordinates. See
 * `ConeIcon` (leaderboard/ConeIcon.tsx) for the glyph itself, extracted from
 * this sketch once the real per-run cone-hit indicator shipped. */
const CONE_SIZE_PX = 144;
const CONE_GAP_PX = 4; // per Ian: cones packed close together
const CONE_TO_ROW_GAP_PX = 8; // per Ian: cones close to the HUD row too

/**
 * #6 — Run HUD, as an actual Leaderboard competitor row (the earlier
 * separate cone-icons/floating-timer HUD is retired — this is the one
 * design going forward, per Ian). It sits in the racer's own row, in the
 * exact slot they'd occupy on the real board (current position, name/car,
 * last completed run) — a bridge between "watching the run, counting up the
 * seconds" and "cut to where they now stand." Cone hits from the retired
 * version move to the end of this row instead of floating separately.
 *
 * Built from `LeaderboardRow` — the real, shared row renderer (extracted
 * from this exact sketch into `leaderboard/LeaderboardRow.tsx` so
 * `StaticFullList` and this HUD render identically instead of each
 * reimplementing the row by hand) — not an approximation, and rendered at
 * its real pixel size (`ROW_HEIGHT`, `WIDTH_FOR_EVENT`, `RankCircle`
 * diameter, etc.) — no separate scale wrapper of its own anymore, since this
 * whole file now scales everything once, at the `Frame` level. Only the
 * last cell is new: everywhere else `autocrossRowCells` would put "Fast"
 * (this run's fastest), this swaps in a live "THIS RUN" cell for the run
 * currently in progress, using the same `StatBlock` component and the real
 * leader/featured endcap color rule (`endcapBgFor`/`endcapTextFor`, exported
 * from `rowCells.tsx` for this reuse) — this racer is `leader`, not
 * `featured`, so it's green, not a hand-picked "live" yellow.
 *
 * Cone hits (the real supplied Noun Project icon, monochrome rust, no
 * background) sit just past the row's right edge — "at the end of" it, per
 * Ian — rather than as a cell inside the row itself, so the reusable
 * `LeaderboardRow` stays a faithful board row with no HUD-only concerns
 * baked in.
 *
 * Positioned flush left, offset down 30px from the top (real 1920-space
 * pixels) — not flush at the very top edge, not the full `TITLE_HEIGHT`
 * (72px) either; per Ian, that read as further down than intended once
 * actually measured on screen.
 *
 * Also per Ian: the real build won't try to live-detect cone hits — it'll
 * generate the HUD with the run's final/full cone count already baked in,
 * and he'll decide in the edit when each cone actually "appears" on screen.
 * Ian doesn't know yet what the final "this run" cell should show either —
 * this is step one, just to see a real row (plus cones) in place. */
const RunHudSketch = () => {
  const width = WIDTH_FOR_EVENT.autocross;
  // a real featured racer from this session's fixture data (see
  // leaderboard-configs/autocross-manual-featured.json) — last run 52.281s,
  // currently mid-run on their next attempt.
  const racer = { pos: 1, name: "Hudson Smith", car: "2009 Honda Fit Sport", runs: [56.008, 53.745, 53.342, 52.281] };
  const state: RowState = { featured: false, leader: true };
  const cells = [
    rankCell(racer, state),
    nameCell(racer, state),
    {
      padding: "18px 30px",
      width: 220,
      content: <StatBlock label="Last" value={formatRunTime(lastOf(racer.runs))} textColor={color.base.text} />,
    },
    {
      padding: "0 34px",
      align: "center" as const,
      width: 240,
      background: endcapBgFor(state),
      content: <StatBlock label="This Run" value={formatRunTime(14.702)} textColor={endcapTextFor(state)} />,
    },
  ];

  return (
    <div style={{ position: "absolute", top: 30, left: 0, display: "flex", alignItems: "center", gap: CONE_TO_ROW_GAP_PX }}>
      <LeaderboardRow cells={cells} state={state} width={width} />
      <div style={{ display: "flex", gap: CONE_GAP_PX }}>
        <ConeIcon size={CONE_SIZE_PX} />
        <ConeIcon size={CONE_SIZE_PX} />
      </div>
    </div>
  );
};

/** #7 — Indiana Jones travel-map mileage animation. Real-world checked: Lake
 * Garnett (Garnett, KS) is ~77 driving miles southwest of Kansas City
 * (source: travelmath.com) — KC sits north/northeast, Garnett south/
 * southwest, and that's reflected in this overview's dot placement, not an
 * arbitrary arc. Still the roughest sketch on purpose: this is just the
 * static starting frame Ian wants nailed down first ("I definitely want to
 * start off with a depiction of it") — the actual planned animation (show
 * the full line first, then zoom in on the KC dot, then follow the line down
 * to Garnett while the mileage counts up) is a real build task for later,
 * not attempted here. Real routing vs. arc and illustrated-map-vs-real-tiles
 * are still open per the issue. */
/** the same "little label" style as the mileage callout — translucent black
 * chip, white text, sized to the copy — reused for the KC/Lake Garnett point
 * labels too, per Ian, rather than the previous stroke-outlined bare text.
 * Text sits at the box's true center (`y=0` against a rect centered on the
 * same origin) with `dominantBaseline="central"` — the same vertical-
 * centering convention `TextChip` uses for the corner labels, not a
 * hand-tweaked offset. */
const mapLabel = (text: string, cx: number, cy: number, fontSizePx: number) => {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d");
  if (ctx) ctx.font = `700 ${fontSizePx}px ${fontFamily}`;
  const textWidth = ctx ? ctx.measureText(text).width : text.length * fontSizePx * 0.6;
  const pX = 40;
  const pY = 24;
  const w = Math.ceil(textWidth + pX * 2);
  const h = Math.ceil(fontSizePx + pY * 2);
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="rgba(0,0,0,0.72)" />
      <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fontFamily={fontFamily} fontWeight={700} fontSize={fontSizePx} fill="white">
        {text}
      </text>
    </g>
  );
};

const TravelMapSketch = () => (
  <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} viewBox={`0 0 ${REAL_WIDTH} ${REAL_HEIGHT}`}>
    <path
      d="M 1360 180 Q 1040 520 440 920"
      fill="none"
      stroke={color.core.grit.ramp[300]}
      strokeWidth="12"
      strokeDasharray="32 24"
    />
    <circle cx="1360" cy="180" r="24" fill="white" stroke="black" strokeWidth="8" />
    <circle cx="440" cy="920" r="24" fill={color.core.grit.ramp[300]} stroke="white" strokeWidth="8" />
    {mapLabel("KC", 1360, 104, 52)}
    {mapLabel("LAKE GARNETT", 440, 1012, 52)}
    {mapLabel("77 MI", 900, 552, 72)}
  </svg>
);

/** Jump straight to one frame via a `#`-fragment on the URL (e.g.
 * `...&viewMode=story#6-run-hud`) instead of scrolling through the whole
 * gallery every time. A plain fragment doesn't work on its own here — the
 * browser tries to scroll to the id on initial navigation, before React has
 * rendered it, and (for a normal `id()` fragment on the anchor) gives up
 * rather than retrying once the element exists. This retries on mount.
 *
 * Only works via the direct renderer URL
 * (`http://localhost:6273/iframe.html?id=design-sketches-backlog--all-sketches&viewMode=story#6-run-hud`),
 * not Storybook's own manager UI (`?path=/story/...`) — the manager loads
 * the story in a nested iframe and doesn't forward a `#`-fragment from the
 * outer URL into it, so there's nothing here to read in that case. */
const ScrollToHashOnMount: React.FC = () => {
  React.useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
  return null;
};

type Story = StoryObj;

export const AllSketches: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <ScrollToHashOnMount />
      <Frame label="#1 Social link — Instagram">
        <SocialLinkSketch glyph={InstagramGlyph} handle="OIORACING" />
      </Frame>
      <Frame label="#1 Social link — Facebook">
        <SocialLinkSketch glyph={FacebookGlyph} handle="OIORACING" />
      </Frame>
      <Frame label="#1 Social link — YouTube">
        <SocialLinkSketch glyph={YoutubeGlyph} handle="@OIORACING" />
      </Frame>
      <Frame label="#1 Social link — Website (no slash)">
        <SocialLinkSketch glyph={LinkGlyph} handle="OIORACING.COM" showSlash={false} />
      </Frame>
      <Frame label="#5 Venue tag">
        <VenueTagSketch />
      </Frame>
      <Frame label="#2 Event date/time tag">
        <EventDateSketch />
      </Frame>
      <Frame label="#4 Caption card (replaces the SCCA CTA)">
        <CaptionCardSketch />
      </Frame>
      <Frame label="#6 Run HUD">
        <RunHudSketch />
      </Frame>
      <Frame label="#7 Indiana Jones travel-map mileage">
        <TravelMapSketch />
      </Frame>
    </div>
  ),
};
