import "./index.css";
import { Composition, Still } from "remotion";
import { Overlay } from "./Overlay";
import { LeaderboardComposition, LeaderboardProps, resolveConfig } from "./leaderboard/Leaderboard";
import { LeaderboardRunSequenceComposition } from "./leaderboard/LeaderboardRunSequence";
import { computeDuration } from "./leaderboard/layout";
import { computeRunSequenceDuration } from "./leaderboard/runSequence";
import { LowerThird, computeLowerThirdDuration } from "./lower-third/LowerThird";
import { LowerThirdProps } from "./lower-third/types";
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
import defaultVerticalHalfLeaderboardConfig from "../leaderboard-configs/vertical-rallycross-half.json";
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
        Bottom-half crop, sized to sit under a landscape A/B-roll clip in a
        portrait edit (issue #13) — same board, just a shorter frame, which
        is enough to make the full field lock into scroll mode instead of
        fitting compact (see layout.ts's computeLayout).
      */}
      <Composition
        id="LeaderboardVerticalHalf"
        component={LeaderboardComposition}
        width={frame.verticalVideoHalf.width}
        height={frame.verticalVideoHalf.height}
        fps={30}
        durationInFrames={90}
        defaultProps={defaultVerticalHalfLeaderboardConfig as LeaderboardProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: computeDuration(resolveConfig(props as LeaderboardProps), 30),
        })}
      />
      {/*
        Chains the Leaderboard's existing run-to-run camera-follow transition
        across every run of the event, back to back (issue #13) — a config
        with a full `racers[].runs` history in, one continuous "race through
        the event" render out. See leaderboard/runSequence.ts.
      */}
      <Composition
        id="LeaderboardRunSequence"
        component={LeaderboardRunSequenceComposition}
        width={frame.verticalVideo.width}
        height={frame.verticalVideo.height}
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
