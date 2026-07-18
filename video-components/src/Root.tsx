import "./index.css";
import { Composition, Still } from "remotion";
import { Overlay } from "./Overlay";
import { LeaderboardComposition, LeaderboardProps, resolveConfig } from "./leaderboard/Leaderboard";
import { computeDuration } from "./leaderboard/layout";
import { SocialCard, SocialCardProps } from "./social/SocialCard";
import { aspectById } from "./social/aspects";
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
