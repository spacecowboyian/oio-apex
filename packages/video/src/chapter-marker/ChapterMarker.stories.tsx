import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { Player } from "@remotion/player";
import { ChapterMarker, computeChapterMarkerDuration, computeChapterMarkerHeldFrame } from "./ChapterMarker";
import { buildYouTubeChapters, validateChapters, timestamp } from "./chapters";
import { Chapter } from "./types";
import { color, fontStack, frame as frameTokens } from "../theme";

const PHOTO_URL = "/betty-datsun-521.png";

/** A worked chapter list for a how-to — the shape a real video would carry. */
const CHAPTERS: Chapter[] = [
  { seq: 1, title: "What you need", startSeconds: 0 },
  { seq: 2, title: "Getting it on stands", startSeconds: 74 },
  { seq: 3, title: "Bleeding the brakes", startSeconds: 268 },
  { seq: 4, title: "The bit everyone gets wrong", startSeconds: 512 },
  { seq: 5, title: "Bedding them in", startSeconds: 903 },
];

const meta: Meta<typeof ChapterMarker> = {
  title: "Video/Chapter Marker",
  component: ChapterMarker,
  parameters: {
    docs: {
      description: {
        component:
          "The on-screen title that breaks a long-form video into sections. A preset over the " +
          "shared corner-label choreography, anchored top-left and not configurable — chapters are " +
          "structure, and a marker that moves between sections stops being a structural cue. " +
          "Bottom belongs to the lower third, top-right to the event and venue tags.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof ChapterMarker>;

const Stage: React.FC<{ children: React.ReactNode; blowOut?: boolean }> = ({ children, blowOut }) => (
  <div style={{ width: 960, aspectRatio: "16 / 9", position: "relative", background: color.base.black }}>
    {/* eslint-disable-next-line @remotion/warn-native-media-tag --
        Story-only backdrop. The rule exists so a still is decoded before a
        frame is captured; nothing here enters a render, and <Img /> needs a
        Remotion context this preview does not have. */}
    <img
      src={PHOTO_URL}
      alt=""
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        // A deliberately blown-out plate — the worst case a white marker has to
        // survive.
        filter: blowOut ? "brightness(2.2) contrast(0.75)" : undefined,
      }}
    />
    {children}
  </div>
);

/** Held at the frame where the marker is fully revealed. */
export const Playground: Story = {
  args: { seq: 3, title: "Bleeding the brakes" },
  render: (args) => (
    <Stage>
      <Player
        component={ChapterMarker}
        inputProps={args}
        durationInFrames={computeChapterMarkerDuration(args.holdSeconds)}
        compositionWidth={frameTokens.video.width}
        compositionHeight={frameTokens.video.height}
        fps={30}
        initialFrame={computeChapterMarkerHeldFrame()}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        controls
      />
    </Stage>
  ),
};

/**
 * Every chapter in the worked list, at the held frame. Numbers pad to two
 * digits so the boxes stay the same width and the titles line up down the
 * video — the reason `seq` pads rather than being passed pre-formatted.
 */
export const TheWholeVideo: Story = {
  name: "A whole video's chapters",
  render: () => (
    <div style={{ display: "grid", gap: 16 }}>
      {CHAPTERS.map((chapter) => (
        <Stage key={chapter.seq}>
          <Player
            component={ChapterMarker}
            inputProps={{ seq: chapter.seq, title: chapter.title }}
            durationInFrames={computeChapterMarkerDuration()}
            compositionWidth={frameTokens.video.width}
            compositionHeight={frameTokens.video.height}
            fps={30}
            initialFrame={computeChapterMarkerHeldFrame()}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          />
        </Stage>
      ))}
    </div>
  ),
};

/**
 * White marker and white title over a deliberately blown-out plate.
 *
 * There is no light-surface variant. A corner label needs one because it can
 * sit on bare footage; a chapter marker always draws its own scrim, so the
 * ground beneath it is dark no matter what the shot is doing. The black-box
 * version was tried here and read worse — it was contrasting against a darkness
 * the marker had just created (Ian, 2026-08-12).
 */
export const OverBrightFootage: Story = {
  name: "Bright footage",
  args: { seq: 2, title: "Getting it on stands" },
  render: (args) => (
    <Stage blowOut>
      <Player
        component={ChapterMarker}
        inputProps={args}
        durationInFrames={computeChapterMarkerDuration()}
        compositionWidth={frameTokens.video.width}
        compositionHeight={frameTokens.video.height}
        fps={30}
        initialFrame={computeChapterMarkerHeldFrame()}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    </Stage>
  ),
};

/** A long title at the default 0.6 scale, to check it still holds the frame. */
export const LongTitle: Story = {
  name: "Long title",
  args: { seq: 4, title: "The bit everyone gets wrong" },
  render: (args) => (
    <Stage>
      <Player
        component={ChapterMarker}
        inputProps={args}
        durationInFrames={computeChapterMarkerDuration()}
        compositionWidth={frameTokens.video.width}
        compositionHeight={frameTokens.video.height}
        fps={30}
        initialFrame={computeChapterMarkerHeldFrame()}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    </Stage>
  ),
};

/**
 * The same array that renders the markers also emits the description block, so
 * the two cannot drift. `buildYouTubeChapters` throws rather than emitting a
 * list YouTube would silently render as plain text — it needs at least three
 * chapters, the first at 0:00, and none shorter than ten seconds.
 */
export const DescriptionOutput: Story = {
  name: "YouTube description",
  render: () => {
    const tooShort: Chapter[] = [
      { seq: 1, title: "Intro", startSeconds: 0 },
      { seq: 2, title: "Blink", startSeconds: 4 },
      { seq: 3, title: "Done", startSeconds: 40 },
    ];
    return (
      <div style={{ fontFamily: fontStack("helvetica"), color: color.base.white, display: "grid", gap: 24 }}>
        <div>
          <div style={{ fontFamily: fontStack("mono"), fontSize: 12, color: color.base.muted, marginBottom: 8 }}>
            buildYouTubeChapters(CHAPTERS)
          </div>
          <pre
            style={{
              fontFamily: fontStack("mono"),
              fontSize: 14,
              background: color.base.surface2,
              border: `1px solid ${color.base.line}`,
              padding: 16,
              margin: 0,
            }}
          >
            {buildYouTubeChapters(CHAPTERS)}
          </pre>
        </div>
        <div>
          <div style={{ fontFamily: fontStack("mono"), fontSize: 12, color: color.base.muted, marginBottom: 8 }}>
            validateChapters(...) on a list YouTube would reject
          </div>
          <pre
            style={{
              fontFamily: fontStack("mono"),
              fontSize: 14,
              background: color.base.surface2,
              border: `1px solid ${color.base.line}`,
              padding: 16,
              margin: 0,
              color: color.core.grit.ramp[300],
            }}
          >
            {validateChapters(tooShort).join("\n")}
          </pre>
        </div>
        <div style={{ fontFamily: fontStack("mono"), fontSize: 12, color: color.base.muted }}>
          {timestamp(74)} · {timestamp(903)} · {timestamp(3661)}
        </div>
      </div>
    );
  },
};
