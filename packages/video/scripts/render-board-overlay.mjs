#!/usr/bin/env node
/**
 * Render the short-form leaderboard (LeaderboardVerticalLower, 1080x1312) to a
 * TRANSPARENT ProRes 4444 .mov, to be composited over a vertical video (the
 * board sits at the top of a 1080x1920 master, footage fills behind/below it).
 *
 * Usage: node render-board-overlay.mjs <config.json> <out.mov> [runIntervalSeconds]
 * The config is a LeaderboardConfig (leaderboard-configs/*.json).
 */
import path from "node:path";
import fs from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const projectRoot = process.cwd();
const [configPath, outPath, runIntervalArg] = process.argv.slice(2);
if (!configPath || !outPath) {
  console.error("Usage: node render-board-overlay.mjs <config.json> <out.mov> [runIntervalSeconds]");
  process.exit(1);
}

const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
if (runIntervalArg) config.runIntervalSeconds = Number(runIntervalArg);

console.log("Bundling src/index.ts...");
const serveUrl = await bundle({ entryPoint: path.resolve(projectRoot, "src/index.ts") });

// selectComposition runs the composition's calculateMetadata, so the duration
// is computed from the config (computeDuration) just like the studio render.
const composition = await selectComposition({ serveUrl, id: "LeaderboardVerticalLower", inputProps: config });
console.log(`Rendering board ${composition.width}x${composition.height}, ${composition.durationInFrames} frames @ ${composition.fps}fps (${(composition.durationInFrames / composition.fps).toFixed(1)}s), transparent ProRes 4444...`);

await renderMedia({
  composition,
  serveUrl,
  codec: "prores",
  proResProfile: "4444",
  imageFormat: "png",
  pixelFormat: "yuva444p10le",
  inputProps: config,
  outputLocation: outPath,
});
console.log(outPath);
