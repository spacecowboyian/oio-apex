// One tiled JPEG per clip, instead of loose frames.
//
// Why a sheet: a single image shows the clip's whole arc, so a car going
// sideways-to-backwards reads across three cells. Loose frames are ~8x more
// expensive in context AND lower signal — a wipeout is a motion event, and a
// mid-spin still frame reads as ordinary hard cornering.
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { runOk } from "./util.mjs";

const COLS = 8;
const ROWS = 6;
export const CELLS = COLS * ROWS;

/**
 * Sample across the WHOLE clip. At 1fps a clip longer than 48s would overflow
 * the tile and silently truncate to its first 48 seconds, so anything longer
 * gets its sample rate reduced to fit.
 *
 * The grid is sized to the actual sample count rather than always 8x6: an 18s
 * clip on a fixed grid is ~60% black padding, which wastes the very context
 * the sheet exists to save.
 */
export async function contactSheet(filePath, durationSeconds, outDir, name) {
  await mkdir(outDir, { recursive: true });
  const sheetPath = path.join(outDir, `${name}.sheet.jpg`);
  const dur = Math.max(durationSeconds || 0, 0.001);
  const sampleFps = dur > CELLS ? CELLS / dur : 1;

  const samples = Math.max(1, Math.min(CELLS, Math.floor(dur * sampleFps)));
  const cols = Math.min(COLS, samples);
  const rows = Math.ceil(samples / cols);

  await runOk("ffmpeg", [
    "-y", "-i", filePath,
    "-vf", `fps=${sampleFps.toFixed(6)},scale=320:-1,tile=${cols}x${rows}`,
    "-frames:v", "1",
    "-q:v", "4",
    sheetPath,
  ]);

  return {
    sheetPath,
    sampleFps: Math.round(sampleFps * 1e6) / 1e6,
    grid: `${cols}x${rows}`,
    samples,
    // seconds of clip each cell represents — needed to turn "cell 14 looks good"
    // into a real timecode when dense-sampling the interesting window later.
    secondsPerCell: Math.round((1 / sampleFps) * 1000) / 1000,
  };
}

/**
 * Dense-sample a specific window to find real in/out points, once a sheet has
 * shown roughly where the action is. Emits individual frames, not a tile.
 */
export async function denseFrames(filePath, startSeconds, endSeconds, outDir, name, fps = 6) {
  await mkdir(outDir, { recursive: true });
  const pattern = path.join(outDir, `${name}.dense-%03d.jpg`);
  await runOk("ffmpeg", [
    "-y",
    "-ss", String(startSeconds),
    "-to", String(endSeconds),
    "-i", filePath,
    "-vf", `fps=${fps},scale=480:-1`,
    "-q:v", "4",
    pattern,
  ]);
  return { pattern, fps, startSeconds, endSeconds };
}
