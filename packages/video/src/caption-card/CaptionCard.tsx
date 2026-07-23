import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fontStack } from "../theme";
import { CaptionCardProps } from "./types";

/** Sized for legibility across both a phone and a TV without being
 * "ginormous" — noticeably smaller than the old CTA card's heading (that was
 * the complaint that killed it), landing near the brand's body-caption range,
 * per Ian. */
const CAPTION_FONT_PX = 72;

/** a quick, unobtrusive fade — captions read as subtitles, not a graphic
 * lockup, so they get a soft cut in/out rather than the corner-label's staged
 * box-swipe choreography. */
const FADE_FRAMES = 6;

const DEFAULT_HOLD_SECONDS = 2.5;

/**
 * Burned-in caption card (spacecowboyian/oio-apex #4). One line, hugging the
 * text (not full-width) in the brand guide's signature translucent-black box
 * (`rgba(0,0,0,0.72)`), bottom-center. Deliberately NOT the corner-label
 * grammar: it's forced-caption subtitles for hard-to-hear dialogue, so it's
 * sentence case (the one all-caps exception) and fades softly in/out instead
 * of swiping. Ian decides in the edit exactly when it sits on screen; the
 * component just renders the line for its own clip length.
 */
export const CaptionCard: React.FC<CaptionCardProps> = ({ text }) => {
  const frame = useCurrentFrame();
  // `holdSeconds` drives the clip length via the Composition's
  // calculateMetadata (computeCaptionDuration), so the card reads the resolved
  // duration here rather than the raw prop — the fade-out is anchored to the
  // real end of the clip regardless of how long it was told to hold.
  const { durationInFrames } = useVideoConfig();

  const fadeOutStart = durationInFrames - FADE_FRAMES;
  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, fadeOutStart, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 80,
      }}
    >
      <div
        style={{
          // hugs the text (inline-block, not full-width), one line
          display: "inline-block",
          background: "rgba(0,0,0,0.72)",
          color: "white",
          padding: "28px 64px",
          fontFamily: fontStack("helvetica"),
          fontWeight: 700,
          fontSize: CAPTION_FONT_PX,
          lineHeight: 1.1,
          whiteSpace: "nowrap",
          opacity,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** total frame count of the caption clip (fade in + hold + fade out). */
export const computeCaptionDuration = (holdSeconds: number = DEFAULT_HOLD_SECONDS, fps = 30): number =>
  Math.ceil(FADE_FRAMES + holdSeconds * fps + FADE_FRAMES);
