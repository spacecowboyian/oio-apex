import "./index.css";
import { Composition } from "remotion";
import { Overlay } from "./Overlay";
import { LeaderboardComposition, LeaderboardProps, resolveConfig } from "./leaderboard/Leaderboard";
import { computeDuration } from "./leaderboard/layout";
import { LowerThird, computeLowerThirdDuration } from "./lower-third/LowerThird";
import { LowerThirdProps } from "./lower-third/types";
// Title-less on purpose — see LeaderboardConfig.title docs: a config that omits
// `title` inherits whatever defaultProps last had via Remotion's shallow prop
// merge, so the safest default is one with no optional fields set at all.
// TEMP: swapped to autocross-position-change.json for debugging the position-
// change animation directly in Studio — revert to track.json when done.
import defaultLeaderboardConfig from "../leaderboard-configs/autocross-position-change.json";

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
    </>
  );
};
