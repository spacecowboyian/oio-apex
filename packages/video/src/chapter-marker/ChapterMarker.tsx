import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { cornerLabel, fontStack } from "../theme";
import { ChapterMarkerProps } from "./types";
import { KnockoutBox } from "../lower-third/KnockoutBox";
import {
  cornerLabelStaging,
  computeCornerLabelDuration,
  computeCornerLabelHeldFrame,
  DEFAULT_HOLD_SECONDS,
} from "../corner-label/staging";
import { HERO_FONT_PX, padX, padY } from "../corner-label/sizing";

/**
 * Animated chapter marker — the on-screen title that breaks a long-form video
 * into sections.
 *
 * A preset over the shared corner-label choreography, like the lower third and
 * the event/venue tags: the scrim fades in, the boxed sequence marker swipes in
 * from the anchored edge and holds, then the title reveals from behind it; exit
 * reverses at twice the speed. Same motion as everything else in the system,
 * because a new device would read as a different show.
 *
 * It is anchored top-left and not configurable. Chapters are the video's
 * structure and should land in the same place every time — a marker that moves
 * between sections stops being a structural cue. Bottom is the lower third's;
 * top-right is the event/venue tags'.
 *
 * This is the same grammar as the brand guide's numbered sections (a mono
 * sequence marker in a corner-label box, then the title — `type.heading`'s
 * `subheadRule`) carried into video. It is a separate implementation on
 * purpose: `SectionHeading` sizes in rem for a document that reflows, this
 * sizes in px against a fixed 1920x1080 export.
 */
export const ChapterMarker: React.FC<ChapterMarkerProps> = ({
  seq,
  title: rawTitle,
  holdSeconds = DEFAULT_HOLD_SECONDS,
  safeInsetPx = 64,
  scrimHeightPct = 24,
  fontScale = 0.6,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Always the dark-surface palette: white box, white title. The marker draws
  // its own scrim, so what sits behind it is always dark — there is nothing for
  // a light-surface variant to contrast against.
  const palette = cornerLabel.onDark;
  const fontFamily = fontStack("helvetica");
  const fontPx = HERO_FONT_PX * fontScale;
  const paddingYPx = padY(fontPx);
  const paddingXPx = padX(fontPx);

  const { gradientShown, boxShown, boxTranslateX, wordTranslatePct } = cornerLabelStaging({
    frame,
    fps,
    anchor: "left",
    holdSeconds,
  });

  /**
   * All-caps, enforced here rather than asked of callers — the same house rule
   * corner labels follow (Ian, 2026-07-23), and for the same reason: the box is
   * sized from the measured string, so casing has to be settled before
   * measurement or the box comes out the wrong width.
   *
   * Numbers pad to two digits so chapter 2 and chapter 10 produce the same box
   * width and the titles line up down the video.
   */
  const marker = (typeof seq === "number" ? String(seq).padStart(2, "0") : seq).toUpperCase();
  const title = rawTitle.toUpperCase();

  return (
    <AbsoluteFill>
      {/* Always drawn. See types.ts — the scrim is what makes white-on-anything
          work, so it is not optional. */}
      <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: `${scrimHeightPct}%`,
            background:
              "linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.8) 100%)",
          opacity: gradientShown,
        }}
      />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "flex-start",
          paddingTop: safeInsetPx,
          paddingBottom: 64,
          paddingLeft: 64,
          paddingRight: 64,
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
          {/* The marker is a true knockout, same as the lower third's box: the
              digits are cut out of the fill so the footage shows through them,
              rather than being drawn in a colour that may or may not contrast. */}
          <div style={{ transform: `translateX(${boxTranslateX}px)`, opacity: boxShown }}>
            <KnockoutBox
              text={marker}
              boxBg={palette.boxBg}
              fontFamily={fontFamily}
              fontSizePx={fontPx}
              paddingYPx={paddingYPx}
              paddingXPx={paddingXPx}
            />
          </div>
          <div style={{ overflow: "hidden" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                whiteSpace: "nowrap",
                lineHeight: 1,
                fontFamily,
                fontWeight: 700,
                fontSize: fontPx,
                padding: `${paddingYPx}px ${paddingXPx}px`,
                color: palette.plainColor,
                transform: `translateX(${wordTranslatePct}%)`,
              }}
            >
              {title}
            </span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Same duration math as every other corner-label preset. */
export const computeChapterMarkerDuration = computeCornerLabelDuration;
export const computeChapterMarkerHeldFrame = computeCornerLabelHeldFrame;
