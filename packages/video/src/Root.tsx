import "./index.css";
import { Composition, Still } from "remotion";
import { Overlay } from "./Overlay";
import { LeaderboardComposition, LeaderboardProps, resolveConfig } from "./leaderboard/Leaderboard";
import { LeaderboardRunSequenceComposition } from "./leaderboard/LeaderboardRunSequence";
import { computeDuration } from "./leaderboard/layout";
import { computeRunSequenceDuration } from "./leaderboard/runSequence";
import { LowerThird, computeLowerThirdDuration } from "./lower-third/LowerThird";
import { LowerThirdProps } from "./lower-third/types";
import { EventDate } from "./event-tags/EventDate";
import { VenueTag } from "./event-tags/VenueTag";
import { EventDateProps, VenueTagProps } from "./event-tags/types";
import { SocialLink, computeSocialLinkDuration } from "./social-link/SocialLink";
import { SocialLinkProps } from "./social-link/types";
import { CaptionCard, computeCaptionDuration } from "./caption-card/CaptionCard";
import { CaptionCardProps } from "./caption-card/types";
import { RunHud, computeRunHudDuration } from "./run-hud/RunHud";
import { RunHudProps } from "./run-hud/types";
import { SocialCard, SocialCardProps } from "./social/SocialCard";
import { aspectById } from "./social/aspects";
import { frame } from "./theme";
// Title-less on purpose — see LeaderboardConfig.title docs: a config that omits
// `title` inherits whatever defaultProps last had via Remotion's shallow prop
// merge, so the safest default is one with no optional fields set at all.
// TEMP: swapped to autocross-position-change.json for debugging the position-
// change animation directly in Studio — revert to track.json when done.
import defaultLeaderboardConfig from "../leaderboard-configs/autocross-position-change.json";
import defaultVerticalLeaderboardConfig from "../leaderboard-configs/vertical-rallycross.json";
import defaultVerticalLowerLeaderboardConfig from "../leaderboard-configs/vertical-rallycross-lower.json";
import defaultRunSequenceConfig from "../leaderboard-configs/rallycross-run-sequence.json";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Overlay"
        component={Overlay}
        durationInFrames={75}
        fps={30}
        width={1920}
        height={1080}
      />
      {/*
        One composition for every leaderboard, driven entirely by a JSON config
        (see ../leaderboard-configs/*.json and video-components/README.md for the
        data contract). To render a new leaderboard, no code changes needed:
          npx remotion render src/index.ts Leaderboard out/name.mp4 --props=./leaderboard-configs/name.json
      */}
      <Composition
        id="Leaderboard"
        component={LeaderboardComposition}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={90}
        defaultProps={defaultLeaderboardConfig as LeaderboardProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: computeDuration(resolveConfig(props as LeaderboardProps), 30),
        })}
      />
      {/*
        Same component, portrait frame — full-bleed vertical (issue #13:
        vertical shorts). `frameWidth`/`frameHeight` in the config drive the
        board's own sizing (see layout.ts); the Composition's width/height
        just need to match so the frame Remotion renders isn't cropping a
        board sized for a different canvas.
      */}
      <Composition
        id="LeaderboardVertical"
        component={LeaderboardComposition}
        width={frame.verticalVideo.width}
        height={frame.verticalVideo.height}
        fps={30}
        durationInFrames={90}
        defaultProps={defaultVerticalLeaderboardConfig as LeaderboardProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: computeDuration(resolveConfig(props as LeaderboardProps), 30),
        })}
      />
      {/*
        The board's own crop, sized to sit directly under a landscape 16:9
        clip stacked above it in a portrait edit (issue #13) — 1080x1312
        (~68% of a 1920-tall canvas; a 1080-wide 16:9 clip takes the
        remaining ~608px). `fillFrame` in the config top-anchors the board
        flush against this crop's top edge (= flush against the video's
        bottom edge once stacked) without changing row size — see
        layout.ts's computeLayout and LeaderboardConfig.fillFrame.
      */}
      <Composition
        id="LeaderboardVerticalLower"
        component={LeaderboardComposition}
        width={frame.verticalVideoLower.width}
        height={frame.verticalVideoLower.height}
        fps={30}
        durationInFrames={90}
        defaultProps={defaultVerticalLowerLeaderboardConfig as LeaderboardProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: computeDuration(resolveConfig(props as LeaderboardProps), 30),
        })}
      />
      {/*
        Chains the Leaderboard's existing run-to-run camera-follow transition
        across every run of the event, back to back (issue #13) — a config
        with a full `racers[].runs` history in, one continuous "race through
        the event" render out. Same 1080x1312 "lower" crop as
        LeaderboardVerticalLower, since this is meant to pair with a
        landscape clip stacked above it. See leaderboard/runSequence.ts.
      */}
      <Composition
        id="LeaderboardRunSequence"
        component={LeaderboardRunSequenceComposition}
        width={frame.verticalVideoLower.width}
        height={frame.verticalVideoLower.height}
        fps={30}
        durationInFrames={90}
        defaultProps={defaultRunSequenceConfig as LeaderboardProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: computeRunSequenceDuration(resolveConfig(props as LeaderboardProps), 30),
        })}
      />
      <Composition
        id="LowerThird"
        component={LowerThird}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={computeLowerThirdDuration()}
        defaultProps={
          {
            // locked as the one house style: white box, entering from the
            // right — see the "Main" story in LowerThird.stories.tsx.
            fact: "85 MR2",
            name: "GOBLIN",
            anchor: "right",
            surface: "dark",
            holdSeconds: 3,
          } satisfies LowerThirdProps
        }
        calculateMetadata={({ props }) => ({
          durationInFrames: computeLowerThirdDuration((props as LowerThirdProps).holdSeconds),
        })}
      />
      {/*
        Event date/time corner label (issue #2) — a thin preset over the same
        LowerThird engine, anchored top-right at the smaller tag size. Box =
        region/discipline code, plain word = the event date. Driven by its own
        `code`/`dateISO` contract; the shared choreography's duration math is
        reused directly (font size doesn't affect timing).
          npx remotion render src/index.ts EventDate out/event-date.mp4 --props=./event-tag-configs/name.json
      */}
      <Composition
        id="EventDate"
        component={EventDate}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={computeLowerThirdDuration()}
        defaultProps={
          {
            code: "KCRX",
            dateISO: "2026-07-19",
            holdSeconds: 3,
          } satisfies EventDateProps
        }
        calculateMetadata={({ props }) => ({
          durationInFrames: computeLowerThirdDuration((props as EventDateProps).holdSeconds),
        })}
      />
      {/*
        Venue/track tag (issue #5) — the left-anchored top-corner sibling of
        EventDate, same LowerThird engine at the tag size. Box = venue name,
        plain word = city/state. Own `venue`/`location` contract; the shared
        choreography's duration math is reused directly.
          npx remotion render src/index.ts VenueTag out/venue.mp4 --props=./event-tag-configs/name.json
      */}
      <Composition
        id="VenueTag"
        component={VenueTag}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={computeLowerThirdDuration()}
        defaultProps={
          {
            venue: "I-35 SPEEDWAY",
            location: "WINSTON, MISSOURI",
            holdSeconds: 3,
          } satisfies VenueTagProps
        }
        calculateMetadata={({ props }) => ({
          durationInFrames: computeLowerThirdDuration((props as VenueTagProps).holdSeconds),
        })}
      />
      {/*
        Social-link corner label (issue #1) — an icon-knockout box + handle
        over the same shared corner-label choreography, entering from the left.
        `platform` picks the brand glyph (and whether the slash shows); `handle`
        is the plain word. Same duration math as the other corner labels.
          npx remotion render src/index.ts SocialLink out/social.mp4 --props=./social-link-configs/name.json
      */}
      <Composition
        id="SocialLink"
        component={SocialLink}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={computeSocialLinkDuration()}
        defaultProps={
          {
            platform: "instagram",
            handle: "OIORACING",
            surface: "dark",
            holdSeconds: 3,
          } satisfies SocialLinkProps
        }
        calculateMetadata={({ props }) => ({
          durationInFrames: computeSocialLinkDuration((props as SocialLinkProps).holdSeconds),
        Burned-in caption card (issue #4) — forced captions for hard-to-hear
        dialogue. One line, hugging the text, translucent black box,
        bottom-center; fades in/out. Duration derives from holdSeconds.
          npx remotion render src/index.ts CaptionCard out/caption.mp4 --props=./caption-configs/name.json
      */}
      <Composition
        id="CaptionCard"
        component={CaptionCard}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={computeCaptionDuration()}
        defaultProps={
          {
            text: "Yeah and then I ran right into that cow.",
            holdSeconds: 2.5,
          } satisfies CaptionCardProps
        }
        calculateMetadata={({ props }) => ({
          durationInFrames: computeCaptionDuration((props as CaptionCardProps).holdSeconds),
        })}
        Run HUD (issue #6) — a persistent on-screen HUD for the run in
        progress, rendered as a real LeaderboardRow with a live THIS RUN
        count-up plus cone-hit icons at the row's right edge. Transparent
        background: composite over run footage. Duration = run length + hold.
          npx remotion render src/index.ts RunHud out/run-hud.mov --props=./run-hud-configs/name.json
      */}
      <Composition
        id="RunHud"
        component={RunHud}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={computeRunHudDuration(14.702, 1)}
        defaultProps={
          {
            racer: { pos: 1, name: "Hudson Smith", car: "2009 Honda Fit Sport", runs: [56.008, 53.745, 53.342, 52.281] },
            thisRun: 14.702,
            cones: 2,
            event: "autocross",
            holdSeconds: 1,
          } satisfies RunHudProps
        }
        calculateMetadata={({ props }) => {
          const p = props as RunHudProps;
          return { durationInFrames: computeRunHudDuration(p.thisRun, p.holdSeconds) };
        }}
      />
      {/*
        Headless PNG export of a single branded social card — no Storybook,
        no browser interaction. See scripts/render-social-still.mjs.
          npx remotion render src/index.ts SocialCard out.png --props=./props.json
      */}
      <Still
        id="SocialCard"
        component={SocialCard}
        width={1080}
        height={1350}
        defaultProps={
          {
            imagePath: "",
            fact: "",
            name: "",
            anchor: "right",
            surface: "dark",
            cropX: 50,
            cropY: 50,
            zoom: 1,
            aspectId: "portrait",
          } as SocialCardProps
        }
        calculateMetadata={({ props }) => {
          const aspect = aspectById((props as SocialCardProps).aspectId);
          return { width: aspect.width, height: aspect.height };
        }}
      />
    </>
  );
};
