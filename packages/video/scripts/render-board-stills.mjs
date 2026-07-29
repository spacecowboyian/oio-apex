#!/usr/bin/env node
/**
 * Static leaderboard stills — one PNG per run (throughRun 1..N) plus FINAL.
 * Transparent, 1080x1312 (the LeaderboardVerticalLower crop).
 *
 * Usage: node stills.mjs <config.json> <outDir>
 */
import path from "node:path";
import fs from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const projectRoot = process.cwd();
const [configPath, outDir] = process.argv.slice(2);
const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
await fs.mkdir(outDir, { recursive: true });

const totalRuns = Math.max(...config.racers.map((r) => r.runs.length));

console.log("Bundling...");
const serveUrl = await bundle({ entryPoint: path.resolve(projectRoot, "src/index.ts") });

const targets = [
  ...Array.from({ length: totalRuns }, (_, i) => ({ label: `run-${String(i + 1).padStart(2, "0")}`, throughRun: i + 1 })),
  { label: "final", throughRun: null },
];

for (const t of targets) {
  // a static board, so no previousThroughRun / camera-follow transition
  const props = { ...config, throughRun: t.throughRun, previousThroughRun: null };
  const composition = await selectComposition({ serveUrl, id: "LeaderboardVerticalLower", inputProps: props });
  // mid-composition: past the entrance animation, before the board animates
  // itself back out in the last frames
  const frame = Math.floor(composition.durationInFrames / 2);
  const out = path.join(outDir, `${t.label}.png`);
  await renderStill({ composition, serveUrl, inputProps: props, output: out, imageFormat: "png", frame });
  console.log(`${t.label.padEnd(8)} frame ${frame}/${composition.durationInFrames}  ${out}`);
}
