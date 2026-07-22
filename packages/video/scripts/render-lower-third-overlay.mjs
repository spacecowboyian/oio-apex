#!/usr/bin/env node
/**
 * Render the animated LowerThird component to a TRANSPARENT ProRes 4444 .mov,
 * sized/timed to be composited over a specific video clip. The clip itself is
 * NOT drawn here — this is just the alpha lower-third, which ffmpeg then lays
 * over the footage (see brand-video.mjs, which orchestrates both steps).
 *
 * Animate-in only, held for the whole clip: we render exactly `durationInFrames`
 * frames with a `holdSeconds` big enough that the component's staged exit never
 * begins inside that window — so the label swipes in, reveals, and holds to the
 * end with no out animation.
 *
 * Usage: node render-lower-third-overlay.mjs <props.json> <out.mov>
 * props.json: { fact, name, anchor, surface, placement?, safeInsetPx?, holdSeconds?, width?, height?, fps?, durationInFrames }
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "node:fs/promises";

/**
 * Render the transparent lower-third overlay for a clip. `props` is a plain
 * object (same fields as the props.json above); `durationInFrames` is required
 * and should equal the clip's frame count so the exit never renders.
 */
export async function renderLowerThirdOverlay(props, outPath, { projectRoot = process.cwd() } = {}) {
  const width = props.width ?? 1080;
  const height = props.height ?? 1920;
  const fps = props.fps ?? 30;
  if (!props.durationInFrames) throw new Error("renderLowerThirdOverlay: durationInFrames (clip length in frames) is required");

  const inputProps = {
    fact: props.fact ?? "",
    name: props.name ?? "",
    anchor: props.anchor ?? "right",
    surface: props.surface ?? "dark",
    placement: props.placement ?? "bottom",
    safeInsetPx: props.safeInsetPx ?? 0,
    // hold longer than the clip so the exit never starts inside the rendered range
    holdSeconds: props.holdSeconds ?? Math.ceil(props.durationInFrames / fps) + 5,
  };

  const serveUrl = await bundle({ entryPoint: path.resolve(projectRoot, "src/index.ts") });
  const composition = await selectComposition({ serveUrl, id: "LowerThird", inputProps });
  // Override the registered 1920x1080 landscape metadata for this clip: portrait
  // dims, and a fixed frame count = the clip length (calculateMetadata would
  // otherwise size the duration to include the exit).
  composition.width = width;
  composition.height = height;
  composition.fps = fps;
  composition.durationInFrames = props.durationInFrames;

  await renderMedia({
    composition,
    serveUrl,
    codec: "prores",
    proResProfile: "4444", // 4444 carries the alpha channel
    imageFormat: "png", // png frames preserve transparency through the pipeline
    pixelFormat: "yuva444p10le",
    inputProps,
    outputLocation: outPath,
  });
  return { outPath, width, height, fps, durationInFrames: props.durationInFrames };
}

// CLI entry: node render-lower-third-overlay.mjs <props.json> <out.mov>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [propsPath, outPath] = process.argv.slice(2);
  if (!propsPath || !outPath) {
    console.error("Usage: node render-lower-third-overlay.mjs <props.json> <out.mov>");
    process.exit(1);
  }
  const props = JSON.parse(await fs.readFile(propsPath, "utf-8"));
  console.log(`Rendering LowerThird overlay (${props.width ?? 1080}x${props.height ?? 1920}, ${props.durationInFrames} frames)...`);
  const r = await renderLowerThirdOverlay(props, outPath);
  console.log(r.outPath);
}
