#!/usr/bin/env node
/**
 * One command: brand a video clip with the animated OIO LowerThird.
 *
 *   node scripts/brand-video.mjs <props.json> <in.(mp4|mov)> <out.mp4>
 *
 * Renders the transparent lower-third overlay at the clip's dimensions (via the
 * LowerThird Remotion composition), then composites it over the footage with
 * ffmpeg. The lower-third animates IN once and HOLDS for the full clip (no exit)
 * — see render-lower-third-overlay.mjs for why. Audio is carried through.
 *
 * props.json: { fact, name, anchor?, surface?, placement?, safeInsetPx?, holdSeconds? }
 *   placement "top" + safeInsetPx clears the reels/shorts UI chrome — the
 *   default for vertical shorts. Width/height/fps/durationInFrames are derived
 *   from the input clip, not the props.
 *
 * Output is normalized to 1080px wide (min IG/reels width), preserving aspect.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import { renderLowerThirdOverlay } from "./render-lower-third-overlay.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_WIDTH = 1080; // normalize to reels/IG min width, keep source aspect

function run(cmd, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "";
    let err = "";
    if (capture) p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}\n${err}`))));
  });
}

async function probeClip(file) {
  const out = await run(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames,duration", "-of", "json", file],
    { capture: true },
  );
  const s = JSON.parse(out).streams[0];
  const [num, den] = s.r_frame_rate.split("/").map(Number);
  const fps = Math.round(num / (den || 1));
  const duration = Number(s.duration) || 0;
  const frames = Number(s.nb_frames) > 0 ? Number(s.nb_frames) : Math.round(duration * fps);
  return { width: Number(s.width), height: Number(s.height), fps, frames };
}

async function main() {
  const [propsPath, inPath, outPath] = process.argv.slice(2);
  if (!propsPath || !inPath || !outPath) {
    console.error("Usage: node scripts/brand-video.mjs <props.json> <in.mp4> <out.mp4>");
    process.exit(1);
  }
  const props = JSON.parse(await fs.readFile(propsPath, "utf-8"));
  const clip = await probeClip(inPath);

  // Output/overlay dims: 1080 wide, source aspect, even height (h264 needs it).
  const outW = OUT_WIDTH;
  const outH = Math.round((OUT_WIDTH * clip.height) / clip.width / 2) * 2;
  console.log(`Clip ${clip.width}x${clip.height} @ ${clip.fps}fps, ${clip.frames} frames -> overlay ${outW}x${outH}`);

  const overlayPath = path.join(os.tmpdir(), `oio-lt-${path.basename(outPath, path.extname(outPath))}.mov`);
  await renderLowerThirdOverlay(
    { ...props, width: outW, height: outH, fps: clip.fps, durationInFrames: clip.frames },
    overlayPath,
    { projectRoot },
  );

  console.log("Compositing with ffmpeg...");
  await run("ffmpeg", [
    "-y",
    "-i", inPath,
    "-i", overlayPath,
    "-filter_complex", `[0:v]scale=${outW}:${outH}:flags=lanczos,setsar=1[bg];[bg][1:v]overlay=0:0:format=auto[v]`,
    "-map", "[v]",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-crf", "18",
    "-preset", "medium",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outPath,
  ]);
  await fs.unlink(overlayPath).catch(() => {});
  console.log(outPath);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
