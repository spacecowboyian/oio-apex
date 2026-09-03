import React from "react";
import "../foundations/fonts";
import { BrandCircle } from "../foundations/BrandCircle";
import { CornerLabel } from "../foundations/CornerLabel";
import { color, fontStack, social } from "../theme";

/**
 * YouTube thumbnail frame — brand guide section 06 "Layout & Composition",
 * built as the real 1280x720 export rather than the guide's on-page mock.
 *
 * Every geometric value below is derived as `target-px / 1280` per the
 * thumbnail layout process doc (Brains
 * projects/oio/canonical/thumbnail-layout-process.md §4b): pick the real
 * output resolution first, derive each cqw/cqh from it, never copy another
 * component's tuned ratio. Colours come from @oio/tokens only.
 *
 * The DOM this renders is exactly what html-to-image captures, so preview
 * and export can never drift (same contract as SocialFrame).
 */

export const THUMB_WIDTH = 1280;
export const THUMB_HEIGHT = 720;

/** 29.37px at 1280 — the guide's own `2.3cqw`, used for BOTH the hero box's
 * inset and its internal padding, and for the corner label's inset. */
export const EDGE = "2.3cqw";
/** ~38px label text at 1280 (guide: `2.97cqw`, authored against this exact
 * 1280x720 export — see process doc §4h). Must land on the label parts, not
 * a wrapper: `.cl-part` sets its own font-size. */
const CORNER_LABEL_FONT = "2.97cqw";
/** guide `.z-vignette`: bottom-anchored, container-relative height. */
const VIGNETTE_HEIGHT = "24cqh";
const VIGNETTE_GRADIENT =
  "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.8) 100%)";
/** guide `.z-hero` — the translucent black box the hero text rides on. */
const HERO_BOX_BG = "rgba(0, 0, 0, 0.72)";

export type HeroPresetId = "spark" | "grit" | "connected" | "vintage";

export type HeroPreset = {
  id: HeroPresetId;
  label: string;
  /** what the pattern is for, straight from the guide's mood rules */
  mood: string;
  line1Color: string;
  line2Color: string;
  /** the "DEAD (or) ALIVE" connector circle sits between the two lines */
  connector: boolean;
  /** the "Redline Revival" script lockup — its own treatment, not a colour pick */
  vintage: boolean;
  /** translucent black box behind the text (the guide drops it for the lockups) */
  box: boolean;
};

/**
 * The four named hero patterns from guide section 05 "Hero Text". One accent
 * per piece, picked by mood — never two accents as co-headline colours.
 * Orange (support.rust) is deliberately absent: it is vintage/patina only,
 * not a mood pick (tokens.json color.support.rust.role).
 */
export const HERO_PRESETS: HeroPreset[] = [
  {
    id: "spark",
    label: "Spark",
    mood: "payoff / victory",
    line1Color: color.base.white,
    line2Color: color.core.spark.ramp[500],
    connector: false,
    vintage: false,
    box: true,
  },
  {
    id: "grit",
    label: "Grit",
    mood: "struggle / mechanical",
    line1Color: color.core.grit.ramp[500],
    line2Color: color.base.white,
    connector: false,
    vintage: false,
    box: true,
  },
  {
    id: "connected",
    label: "Connected",
    mood: "DEAD (or) ALIVE — two states, one story",
    line1Color: color.core.spark.ramp[500],
    line2Color: color.base.white,
    connector: true,
    vintage: false,
    box: true,
  },
  {
    id: "vintage",
    label: "Vintage",
    mood: "Redline Revival script lockup — patina pieces",
    line1Color: color.core.grit.ramp[500],
    line2Color: color.core.spark.ramp[500],
    connector: false,
    vintage: true,
    box: false,
  },
];

export const presetById = (id: HeroPresetId) =>
  HERO_PRESETS.find((p) => p.id === id) ?? HERO_PRESETS[0];

/** connector circle diameter, as a fraction of line 1's font size */
export const CONNECTOR_RATIO = 0.68;
/** how far the circle's left edge sits back over line 1's last letter */
export const CONNECTOR_OVERLAP = 0.45;
/** guide ratio between the vintage script and the chip it carries (41cqw : 8.5cqw) */
export const VINTAGE_SCRIPT_RATIO = 41 / 8.5;

/**
 * Oversize factor needed for a rotated copy of the frame to still cover the
 * frame — computed from the angle instead of hand-tuned per photo, because
 * fixed insets tuned at one frame size break at every other size (process
 * doc §4g) and a baked-in rotate silently follows the next photo loaded
 * (§4b). Both are real bugs that shipped once.
 */
export const coverScaleForRotation = (deg: number, w = THUMB_WIDTH, h = THUMB_HEIGHT) => {
  const a = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
};

export type ThumbnailPhotoTransform = {
  /** focal point the crop pans around, 0-100% of the image */
  cropX: number;
  cropY: number;
  /** 1 = fills the frame with no extra crop; >1 zooms in around (cropX, cropY) */
  zoom: number;
  /** levelling rotation for handheld tilt, degrees */
  rotate: number;
};

export type ThumbnailFrameFields = ThumbnailPhotoTransform & {
  line1: string;
  line2: string;
  preset: HeroPresetId;
  /** line 1 font size in real export px (the single "knob") */
  size1: number;
  /** line 2 font size in real export px — solved from size1 when flush-locked */
  size2: number;
  /** horizontal nudge that brings line 2's ink left edge flush with line 1's */
  dx2: number;
  /** corner label, plain part: year + model */
  fact: string;
  /** corner label, boxed part: nickname */
  name: string;
  /** the OIO badge is conditional — only when a human is on camera */
  showBadge: boolean;
  /** tone of the photo under the label/badge, drives which side gets the box */
  surface: "dark" | "light";
};

export type ThumbnailFrameProps = ThumbnailFrameFields & {
  imageUrl: string | null;
  /** visual scale for the preview; the captured node is always 1280x720 */
  scale?: number;
  /** line 1's measured ink right edge, in frame px from the hero box's content
   * origin — places the connector circle over the real last letter instead of
   * a guessed percentage. Falls back to the guide's mock position. */
  line1InkRight?: number | null;
};

export const HERO_LINE_1_ATTR = "hero-line-1";
export const HERO_LINE_2_ATTR = "hero-line-2";

const heroLineStyle = (size: number, lineColor: string): React.CSSProperties => ({
  fontFamily: fontStack("helvetica"),
  fontWeight: 900,
  letterSpacing: "-0.01em",
  lineHeight: 0.8,
  display: "block",
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  fontSize: size,
  color: lineColor,
  textShadow: "0 0.02em 0.14em rgba(0,0,0,0.55)",
});

export const ThumbnailFrame = React.forwardRef<HTMLDivElement, ThumbnailFrameProps>(
  (
    {
      imageUrl,
      line1,
      line2,
      preset,
      size1,
      size2,
      dx2,
      fact,
      name,
      showBadge,
      surface,
      cropX,
      cropY,
      zoom,
      rotate,
      scale = 1,
      line1InkRight = null,
    },
    ref,
  ) => {
    const p = presetById(preset);
    const cover = coverScaleForRotation(rotate);
    const coverInset = `${(-(cover - 1) / 2) * 100}%`;
    const coverSize = `${cover * 100}%`;
    const connectorDiameter = size1 * CONNECTOR_RATIO;

    return (
      <div style={{ width: THUMB_WIDTH * scale, height: THUMB_HEIGHT * scale, overflow: "hidden" }}>
        <div
          ref={ref}
          style={{
            width: THUMB_WIDTH,
            height: THUMB_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "relative",
            background: color.base.black,
            containerType: "size",
            overflow: "hidden",
          }}
        >
          {imageUrl && (
            /* levelling rotation happens on this wrapper, about the frame's
               centre, with the wrapper oversized + pulled back by the same
               proportion so the rotated rectangle still covers the frame.
               Percentages, never fixed px — see coverScaleForRotation. */
            <div
              style={{
                position: "absolute",
                left: coverInset,
                top: coverInset,
                width: coverSize,
                height: coverSize,
                transform: `rotate(${rotate}deg)`,
                transformOrigin: "50% 50%",
                overflow: "hidden",
                zIndex: 0,
              }}
            >
              {/* eslint-disable-next-line @remotion/warn-native-media-tag --
                  this frame is a browser-only Storybook tool captured by
                  html-to-image, never a Remotion composition; remotion's <Img>
                  needs a Remotion render context. Same contract as SocialFrame. */}
              <img
                src={imageUrl}
                alt={[line1, line2].filter(Boolean).join(" ") || "Thumbnail photo"}
                crossOrigin="anonymous"
                // without this, pressing and moving over the photo starts the
                // browser's own image-drag (ghost thumbnail) and Chrome stops
                // delivering pointermove — the pan would jump once and freeze.
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: `${cropX}% ${cropY}%`,
                  transform: `scale(${zoom})`,
                  transformOrigin: `${cropX}% ${cropY}%`,
                  display: "block",
                }}
              />
            </div>
          )}

          {/* bottom vignette — backs the corner label whatever the photo does there */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: VIGNETTE_HEIGHT,
              background: VIGNETTE_GRADIENT,
              zIndex: 1,
              pointerEvents: "none",
            }}
          />

          {/* hero text — top-left, content-sized, on the translucent black box */}
          <div
            style={{
              position: "absolute",
              top: EDGE,
              left: EDGE,
              zIndex: 2,
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "0.02em",
              background: p.box ? HERO_BOX_BG : "transparent",
              padding: EDGE,
            }}
          >
            {p.vintage ? (
              <VintageLockup line1={line1} line2={line2} size2={size2} dx2={dx2} />
            ) : (
              <>
                <span data-testid={HERO_LINE_1_ATTR} style={heroLineStyle(size1, p.line1Color)}>
                  {line1.toUpperCase()}
                </span>
                <span
                  data-testid={HERO_LINE_2_ATTR}
                  style={{ ...heroLineStyle(size2, p.line2Color), transform: `translateX(${dx2}px)` }}
                >
                  {line2.toUpperCase()}
                </span>
                {p.connector && line1.trim() !== "" && (
                  <div
                    style={{
                      position: "absolute",
                      zIndex: 3,
                      left:
                        line1InkRight === null
                          ? "74.8%"
                          : line1InkRight - connectorDiameter * CONNECTOR_OVERLAP,
                      top: size1 * 0.8 - connectorDiameter * 0.5,
                      transform: "rotate(17deg)",
                    }}
                  >
                    <BrandCircle variant="connector" diameter={`${connectorDiameter}px`}>
                      or
                    </BrandCircle>
                  </div>
                )}
              </>
            )}
          </div>

          {/* OIO badge — conditional, only when a human is on camera. Top-right
              because the hero owns the top-left corner on this format. */}
          {showBadge && (
            <div style={{ position: "absolute", top: EDGE, right: EDGE, zIndex: 2 }}>
              {/* contrast follows the same rule as the corner label's box —
                  white circle on a dark shot, black circle on a light one
                  (tokens cornerLabel.onDark/onLight, process doc §4b). Note
                  SocialFrame passes `invert` the other way round; that reads
                  like a bug there, not a convention to copy. */}
              <BrandCircle variant="wordmark" diameter={social.badgeDiameter} invert={surface === "dark"}>
                OIO
              </BrandCircle>
            </div>
          )}

          {/* corner label — bottom-right, plain part (year + model) first, boxed
              part (nickname) second so the box sits on the frame's outer edge */}
          <div style={{ position: "absolute", right: EDGE, bottom: EDGE, zIndex: 2 }}>
            <CornerLabel fact={fact} name={name} anchor="right" surface={surface} fontSize={CORNER_LABEL_FONT} />
          </div>
        </div>
      </div>
    );
  },
);
ThumbnailFrame.displayName = "ThumbnailFrame";

/**
 * The "Redline Revival" lockup: a tab behind an outlined script with a gold
 * gradient fill in front. Layer order is the reusable part (tab between the
 * outline and the fill); the tab's position is per-word-set.
 */
const VintageLockup: React.FC<{ line1: string; line2: string; size2: number; dx2: number }> = ({
  line1,
  line2,
  size2,
  dx2,
}) => {
  // the script is the knob; the tab derives from it at the guide's ratio
  const chipSize = size2 / VINTAGE_SCRIPT_RATIO;
  const script: React.CSSProperties = {
    fontFamily: fontStack("signPainter"),
    fontSize: size2,
    lineHeight: 1,
    display: "block",
    margin: 0,
    padding: "0 0.5em",
    whiteSpace: "nowrap",
  };
  return (
    <span style={{ position: "relative", display: "inline-block", lineHeight: 0.9, transform: `translateX(${dx2}px)` }}>
      <span
        data-testid={HERO_LINE_2_ATTR}
        style={{
          ...script,
          position: "absolute",
          inset: 0,
          zIndex: 0,
          color: color.core.spark.ramp[500],
          WebkitTextStroke: "0.1em #000",
          paintOrder: "stroke",
          textShadow: "0 0.02em 0.16em rgba(0,0,0,0.55), 0 0 0.04em rgba(0,0,0,0.6)",
        }}
      >
        {line2}
      </span>
      <span
        data-testid={HERO_LINE_1_ATTR}
        style={{
          position: "absolute",
          zIndex: 1,
          top: "7%",
          left: "30%",
          background: color.base.black,
          color: color.core.grit.ramp[500],
          fontFamily: fontStack("helvetica"),
          fontWeight: 700,
          fontSize: chipSize,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          padding: "0.26em 0.5em 0.3em",
          whiteSpace: "nowrap",
        }}
      >
        {line1.toUpperCase()}
      </span>
      <span
        style={{
          ...script,
          position: "relative",
          zIndex: 2,
          background: "linear-gradient(180deg, #FFF7D6 0%, #FCD64F 38%, #F5C200 68%, #E39100 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        }}
      >
        {line2}
      </span>
    </span>
  );
};
