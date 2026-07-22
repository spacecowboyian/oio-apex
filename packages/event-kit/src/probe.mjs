// Visual pass: read what a still or clip actually is.
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { run, runOk } from "./util.mjs";

/* ------------------------------------------------------------------ stills */

/**
 * EXIF + dimensions for a still. ImageMagick first; `sips` as the fallback,
 * since IM's HEIC delegate isn't always present on macOS.
 */
export async function probeStill(filePath) {
  const im = await run("identify", [
    "-format",
    "%w|%h|%[EXIF:Orientation]|%[EXIF:DateTimeOriginal]",
    `${filePath}[0]`,
  ]);
  if (im.code === 0 && im.out.includes("|")) {
    const [w, h, orient, shot] = im.out.trim().split("|");
    return {
      width: Number(w) || null,
      height: Number(h) || null,
      orientation: Number(orient) || 1,
      shotAt: normalizeExifDate(shot),
    };
  }

  const sips = await run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", "-g", "creation", filePath]);
  const grab = (k) => sips.out.match(new RegExp(`${k}:\\s*(.+)`))?.[1]?.trim() ?? null;
  return {
    width: Number(grab("pixelWidth")) || null,
    height: Number(grab("pixelHeight")) || null,
    orientation: 1, // sips reports post-rotation dimensions already
    shotAt: normalizeExifDate(grab("creation")),
  };
}

/** EXIF dates look like "2026:07:19 08:14:03" — make them ISO-ish, or null. */
function normalizeExifDate(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  return `${y}-${mo}-${d}T${hh}:${mm}:${ss}`;
}

/**
 * Write an upright copy. `@napi-rs/canvas`'s loadImage does NOT apply EXIF
 * orientation, which silently sideways-rendered every phone photo at the
 * 2026-07-19 Winston session. Normalizing at ingest means everything
 * downstream can treat pixels as already-correct.
 *
 * Returns the normalized path (always produced, so downstream has one rule).
 */
export async function normalizeStill(filePath, outDir) {
  await mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `${path.basename(filePath, path.extname(filePath))}.jpg`);
  await runOk("convert", [`${filePath}[0]`, "-auto-orient", "-quality", "95", out]);
  return out;
}

/* ------------------------------------------------------------------- clips */

/**
 * ffprobe a clip. Records BOTH durations the plan calls for:
 *
 *   realTimeSeconds — wall-clock event time the footage covers (frames / capture fps)
 *   durationSeconds — how long the file plays as stored
 *
 * For an ordinary 30fps clip these match. For a 120fps capture they diverge by
 * up to 5x once it's conformed for slow motion, which is why the recap word
 * budget and contact-sheet sampling both need the distinction.
 */
export async function probeClip(filePath) {
  const { out } = await runOk("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration,codec_name",
    "-show_entries", "format=duration",
    "-show_entries", "stream_side_data=rotation",
    "-of", "json",
    filePath,
  ]);
  const j = JSON.parse(out);
  const s = j.streams?.[0] ?? {};
  const fps = ratio(s.r_frame_rate) || ratio(s.avg_frame_rate) || 30;
  const durationSeconds = Number(s.duration) || Number(j.format?.duration) || 0;
  const frames = Number(s.nb_frames) || Math.round(durationSeconds * fps);
  const rotation = s.side_data_list?.find((d) => d.rotation != null)?.rotation ?? 0;

  const highFps = fps > 60;
  return {
    width: Number(s.width) || null,
    height: Number(s.height) || null,
    codec: s.codec_name ?? null,
    fps: round(fps),
    rotation: Number(rotation) || 0,
    frames,
    durationSeconds: round(durationSeconds),
    realTimeSeconds: fps ? round(frames / fps) : null,
    // what it becomes if conformed to 30fps for slow motion (only meaningful on high-fps captures)
    conformedSeconds30: highFps ? round(frames / 30) : null,
    highFps,
    hasAudio: await hasAudioStream(filePath),
  };
}

async function hasAudioStream(filePath) {
  const { out } = await run("ffprobe", [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=codec_type", "-of", "csv=p=0", filePath,
  ]);
  return out.trim().startsWith("audio");
}

const ratio = (r) => {
  if (!r) return 0;
  const [n, d] = String(r).split("/").map(Number);
  return d ? n / d : n || 0;
};
const round = (n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null);
