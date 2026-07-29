#!/usr/bin/env node
/**
 * Render the short-form leaderboard (LeaderboardVerticalLower, 1080x1312) to
 * video, to be composited over a vertical master (the board sits at the top of
 * a 1080x1920 frame, footage fills behind/below it).
 *
 * The output EXTENSION picks the codec, since the two cases want opposite
 * things and there's no sensible default covering both:
 *   .mov -> transparent ProRes 4444, for compositing over footage
 *   .mp4 -> H.264 on black, for a card that stands on its own
 *
 * Usage: node render-board-overlay.mjs <config.json> <out.mov> [runIntervalSeconds] [compositionId]
 * The config is a LeaderboardConfig (leaderboard-configs/*.json).
 *
 * `compositionId` defaults to LeaderboardVerticalLower (one static board).
 * Pass `LeaderboardRunSequence` for the "race through the event" chain — same
 * 1080x1312 crop, so the composite recipe below it is identical.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const projectRoot = process.cwd();
const [configPath, outPath, runIntervalArg, compositionArg] = process.argv.slice(2);
if (!configPath || !outPath) {
  console.error("Usage: node render-board-overlay.mjs <config.json> <out.mov> [runIntervalSeconds] [compositionId]");
  process.exit(1);
}
const compositionId = compositionArg || "LeaderboardVerticalLower";
const transparent = !outPath.toLowerCase().endsWith(".mp4");

const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
if (runIntervalArg) config.runIntervalSeconds = Number(runIntervalArg);

console.log("Bundling src/index.ts...");
const serveUrl = await bundle({ entryPoint: path.resolve(projectRoot, "src/index.ts") });

// selectComposition runs the composition's calculateMetadata, so the duration
// is computed from the config (computeDuration) just like the studio render.
const composition = await selectComposition({ serveUrl, id: compositionId, inputProps: config });
console.log(
  `Rendering ${compositionId} ${composition.width}x${composition.height}, ${composition.durationInFrames} frames @ ${composition.fps}fps ` +
    `(${(composition.durationInFrames / composition.fps).toFixed(1)}s), ${transparent ? "transparent ProRes 4444" : "H.264 on black"}...`,
);

await renderMedia({
  composition,
  serveUrl,
  inputProps: config,
  outputLocation: outPath,
  ...(transparent
    ? { codec: "prores", proResProfile: "4444", imageFormat: "png", pixelFormat: "yuva444p10le" }
    : // the compositions are transparent by design, so an opaque codec needs a
      // background explicitly — without it the alpha is simply dropped and the
      // card comes out on whatever the encoder felt like.
      { codec: "h264", imageFormat: "jpeg", crf: 18, pixelFormat: "yuv420p" }),
});
console.log(outPath);
