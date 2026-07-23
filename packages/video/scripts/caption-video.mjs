#!/usr/bin/env node
/**
 * Burn OIO-style captions onto a video, end to end:
 *
 *   audio -> whisper (word timings) -> lines -> one fitted type size ->
 *   transparent CaptionCard clips -> one caption track -> composited output
 *
 * Usage:
 *   node caption-video.mjs <source video> <out.mp4> [--orientation auto]
 *                          [--transcript t.json] [--keep-work]
 *
 * `--orientation` selects the platform safe area from @oio/tokens
 * (landscape | vertical | instagramReels | tiktok | youtubeShorts). `auto`
 * picks landscape or vertical from the source's own aspect. Frame size always
 * comes from the source, so the output is the input plus captions.
 *
 * Two things are deliberately measured rather than assumed:
 *
 * 1. FRAMES, NOT SECONDS. CaptionCard derives its own length from
 *    `holdSeconds` via calculateMetadata, so asking for a duration in seconds
 *    and hoping it lands on the same frame count is how cards drift off their
 *    words and eventually overlap the next one. Each card's exact frame window
 *    is chosen first, then `holdSeconds` is solved backwards from it.
 *
 * 2. WIDTH. The card is `whiteSpace: nowrap`, so an over-long line is CLIPPED
 *    at the frame edge, not wrapped, and nothing complains. Every rendered clip
 *    is measured and the run fails on overflow.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { loadImage } from "@napi-rs/canvas";
import { captionLines, blanksIn } from "./caption-lines.mjs";
import { planCaptions, fitFontSize, usableWidth, safeAreaFor, boxWidth } from "./caption-fit.mjs";

const FPS = 30;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts });
    let out = "", err = "";
    p.stdout?.on("data", (d) => (out += d));
    p.stderr?.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`)),
    );
  });

const ffprobe = (args) => run("ffprobe", ["-v", "error", ...args]);

/** whisper with word timestamps — segment-level is far too coarse to time a card against */
async function transcribe(src, workDir) {
  const wav = path.join(workDir, "audio.wav");
  await run("ffmpeg", ["-y", "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", wav]);
  await run("whisper", [
    wav, "--model", "small", "--language", "en",
    "--word_timestamps", "True", "--output_format", "json", "--output_dir", workDir,
  ]);
  return JSON.parse(await fsp.readFile(path.join(workDir, "audio.json"), "utf8"));
}

/**
 * Transparent filler between cards.
 *
 * `format=yuva444p10le` has to be part of the FILTER GRAPH, not just the output
 * -pix_fmt: the `color` source emits an opaque format, so its `@0` alpha is
 * dropped there and the later yuv->yuva conversion refills alpha at MAX. That
 * silently produces opaque black filler, which blacks out the footage wherever
 * nobody is talking — measured as alpha=940 rather than 0 the first time.
 */
const renderGap = (out, frames, w, h) =>
  run("ffmpeg", [
    "-y", "-v", "error", "-f", "lavfi",
    "-i", `color=c=black@0:s=${w}x${h}:r=${FPS}:d=${(frames / FPS).toFixed(4)},format=yuva444p10le`,
    "-vframes", String(frames), "-c:v", "prores_ks", "-profile:v", "4444",
    "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", out,
  ]);

/** the caption box's real extent in a rendered clip, from its alpha channel */
async function measureRendered(clip, workDir) {
  const png = path.join(workDir, "probe.png");
  await run("ffmpeg", ["-y", "-v", "error", "-i", clip, "-frames:v", "1", png]);
  const img = await loadImage(png);
  const canvas = (await import("@napi-rs/canvas")).createCanvas(img.width, img.height);
  const c = canvas.getContext("2d");
  c.drawImage(img, 0, 0);
  const { data } = c.getImageData(0, 0, img.width, img.height);
  let left = img.width, right = 0, top = img.height, bottom = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (data[(y * img.width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  await fsp.rm(png, { force: true });
  return { left, right, top, bottom, width: right - left + 1 };
}

export async function captionVideo(src, out, { orientation = "auto", transcriptPath, keepWork = false } = {}) {
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), "oio-captions-"));
  try {
    const [w, h] = (await ffprobe([
      "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", src,
    ])).split(",").map(Number);
    const duration = Number(await ffprobe(["-show_entries", "format=duration", "-of", "csv=p=0", src]));
    const totalFrames = Math.ceil(duration * FPS);
    const facing = orientation === "auto" ? (h > w ? "vertical" : "landscape") : orientation;
    console.log(`source ${w}x${h}, ${duration.toFixed(2)}s -> ${facing} safe area`);

    const transcript = transcriptPath
      ? JSON.parse(await fsp.readFile(transcriptPath, "utf8"))
      : await transcribe(src, work);

    // Plan, chunk, verify, re-chunk shorter if needed. The planned character
    // count comes from the transcript's AVERAGE character width, so a line of
    // unusually wide letters can still overflow; rather than pad the estimate
    // until it is safe (wasting space on every normal line), just check.
    const usable = usableWidth(w, facing);
    let { fontSizePx, maxChars } = planCaptions(w, facing, transcript.text.trim());
    let cards;
    for (let attempt = 0; ; attempt++) {
      cards = captionLines(transcript, maxChars);
      const texts = cards.map((c) => c.text);
      fontSizePx = fitFontSize(texts, usable);
      const widest = Math.max(...texts.map((t) => boxWidth(t, fontSizePx)));
      if (widest <= usable) break;
      if (attempt >= 8) throw new Error("no line length fits the frame");
      console.log(`  ${maxChars} chars/line overflows (${Math.ceil(widest)}px of ${usable}px), trying ${maxChars - 2}`);
      maxChars -= 2;
    }
    console.log(`${cards.length} cards, ${maxChars} chars/line, ${fontSizePx}px type for the whole set`);

    // Bundle ONCE for every card — this used to be one `npx remotion render`
    // per card, which re-bundled the whole project 25 times.
    const serveUrl = await bundle({ entryPoint: path.join(PROJECT_ROOT, "src/index.ts") });

    const segments = [];
    let cursor = 0;
    for (const [i, c] of cards.entries()) {
      const startF = Math.round(c.start * FPS);
      const endF = Math.round(c.end * FPS);
      const want = endF - startF;
      const inputProps = {
        text: c.text,
        holdSeconds: want / FPS, // invert computeCaptionDuration: want = ceil(hold*FPS)
        fontSizePx,
        frameWidth: w,
        frameHeight: h,
      };
      const composition = await selectComposition({ serveUrl, id: "CaptionCard", inputProps });
      const clip = path.join(work, `${String(i).padStart(2, "0")}.mov`);
      await renderMedia({
        composition, serveUrl, inputProps,
        codec: "prores",
        proResProfile: "4444",   // 4444 carries the alpha channel
        imageFormat: "png",      // png frames preserve transparency through the pipeline
        pixelFormat: "yuva444p10le",
        outputLocation: clip,
      });

      const box = await measureRendered(clip, work);
      if (box.width > usable) {
        throw new Error(`card ${i} box is ${box.width}px, over the ${usable}px usable width: ${c.text}`);
      }
      console.log(`  [${i}] f${startF}-${endF}  ${box.width}px of ${usable}px  ${c.text}`);

      if (startF > cursor) segments.push({ gap: startF - cursor });
      segments.push({ clip });
      cursor = startF + composition.durationInFrames;
    }
    if (totalFrames > cursor) segments.push({ gap: totalFrames - cursor });

    const list = [];
    for (const [i, seg] of segments.entries()) {
      if (seg.clip) { list.push(seg.clip); continue; }
      const g = path.join(work, `gap${i}.mov`);
      await renderGap(g, seg.gap, w, h);
      list.push(g);
    }
    const concatFile = path.join(work, "concat.txt");
    await fsp.writeFile(concatFile, list.map((p) => `file '${p}'`).join("\n"));
    const track = path.join(work, "track.mov");
    await run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", track]);

    // The composition renders at the source's own size, so this is a straight
    // overlay with no centring offset to get wrong.
    await run("ffmpeg", [
      "-y", "-v", "error", "-i", src, "-i", track,
      "-filter_complex", "[0:v][1:v]overlay=0:0:eof_action=pass[v]",
      "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out,
    ]);

    const safe = safeAreaFor(facing);
    const blanks = blanksIn(cards);
    console.log(
      `\n${out}\n  ${cards.length} cards, ${fontSizePx}px, ${blanks.length} blank(s) at pauses` +
        `${blanks.map((b) => ` ${b.from.toFixed(2)}-${b.to.toFixed(2)}s`).join(",")}` +
        `\n  ${safe.bottom}px above frame bottom, ${usable}px usable width`,
    );
    return { cards, fontSizePx, orientation: facing };
  } finally {
    if (keepWork) console.log(`work kept: ${work}`);
    else await fsp.rm(work, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
  };
  const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--keep-work"));
  const [src, out] = positional;
  if (!src || !out) {
    console.error("usage: caption-video.mjs <source video> <out.mp4> [--orientation auto|landscape|vertical|instagramReels|tiktok|youtubeShorts] [--transcript t.json] [--keep-work]");
    process.exit(1);
  }
  await captionVideo(src, out, {
    orientation: flag("orientation", "auto"),
    transcriptPath: flag("transcript", undefined),
    keepWork: args.includes("--keep-work"),
  });
}
