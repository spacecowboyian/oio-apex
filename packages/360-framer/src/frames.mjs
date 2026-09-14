/** Pull raw fisheye stills out of a clip so the aimer has something to aim at. */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { run, runOk, runPool } from "./util.mjs";
import { resolveCamera } from "./lens.mjs";

/**
 * Where each lens actually lives, which is not the same on every body.
 *
 * The X4 puts both lenses in one file as two video streams. The X1 writes one
 * stream per file — `_00_` and `_10_` side by side — so its second lens is a
 * second `-i`, not another stream map. Everything downstream has to know which,
 * so this is resolved once from the file itself rather than assumed.
 *
 * @returns {{inputs: string[], lens0: string, lens1: string, layout: "streams"|"files"}}
 */
export async function lensSources(clip, { camera = null } = {}) {
  const n = await videoStreamCount(clip);
  // The body is identified from the footage - how it stores its lenses, and
  // how big they are - so a mixed shoot needs no flags.
  const withCam = async (src) => {
    const { width } = await lensFrameSize(src.inputs[0]);
    return { ...src, camera: resolveCamera({ layout: src.layout, frame: width, id: camera }) };
  };
  if (n >= 2) {
    return withCam({ inputs: [clip], lens0: "0:v:0", lens1: "0:v:1", layout: "streams" });
  }
  // A 2:1 single stream is an EQUIRECT master - a whole sphere already
  // stitched, not half of a dual-fisheye pair. Detected by shape rather than
  // by extension or filename: an .insv is always fisheye and an equirect is
  // always 2:1, and nothing else this tool accepts is either. Checked BEFORE
  // the sibling-half lookup, because an equirect has no sibling and would
  // otherwise fall through to the "only one lens found" error - which is
  // exactly what it did before this existed.
  const eq = await equirectSize(clip);
  if (eq) {
    return {
      inputs: [clip], lens0: "0:v:0", lens1: null, layout: "equirect", equirect: true,
      // No lens profile applies: the fisheye fields describe glass, and this
      // frame has already left the glass behind. `resolveCamera` therefore
      // matches nothing and returns the "unknown" body, whose denoise is 0/0 -
      // and that is the RIGHT default here, not an oversight. Studio has
      // already denoised this master (measured: hood luma 2.49 against 4.17
      // rendering the same shot from the raw fisheye), so our chroma pass would
      // be cleaning something already clean and costing detail for it. A shot
      // that wants denoise can still ask, per shot.
      camera: resolveCamera({ layout: "equirect", frame: eq.width, id: camera }),
      size: eq,
    };
  }
  const other = siblingHalf(clip);
  if (other && (await exists(other))) {
    return withCam({ inputs: [clip, other], lens0: "0:v:0", lens1: "1:v:0", layout: "files" });
  }
  throw new Error(
    `Only one lens found for ${path.basename(clip)}: it has a single video stream ` +
      `and no ${other ? path.basename(other) : "_10_"} beside it.`,
  );
}

/**
 * The frame size when a clip is a 2:1 equirect, else null.
 *
 * The tolerance is there because a real export is not always exactly 2:1 -
 * 7680x3840 is, but an odd custom size can land a pixel out and it is still
 * an equirect. Anything further off is a flat video and not ours to reframe.
 */
export async function equirectSize(clip) {
  try {
    const { width, height } = await lensFrameSize(clip);
    if (!width || !height) return null;
    return Math.abs(width / height - 2) < 0.01 ? { width, height } : null;
  } catch {
    return null;
  }
}

/** The `_10_` half that carries the second lens on bodies that split them. */
export function siblingHalf(clip) {
  const b = path.basename(clip);
  if (!b.includes("_00_")) return null;
  return path.join(path.dirname(clip), b.replace("_00_", "_10_"));
}

/**
 * The file + stream to open if that lens is read on its own, outside the
 * combined graph `filterGraph` builds. Scrub extraction runs one lens at a
 * time, so a `1:v:0` (files layout, second input) has to become `0:v:0`
 * relative to that file being the only input.
 */
function singleLensSource(src, which) {
  if (src.layout === "streams") return { file: src.inputs[0], map: src[which] };
  const idx = Number(src[which].split(":")[0]);
  return { file: src.inputs[idx], map: "0:v:0" };
}

/**
 * Pixel size of one lens frame. The seam mask has to match the source it is
 * merged onto exactly, so it is measured rather than assumed - the X4 and X1
 * do not use the same frame size.
 */
export async function lensFrameSize(file) {
  const r = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", file,
  ]);
  const [width, height] = r.out.trim().split("\n")[0].split(",").map(Number);
  return { width, height };
}

async function videoStreamCount(clip) {
  const r = await run("ffprobe", [
    "-v", "error", "-select_streams", "v",
    "-show_entries", "stream=index", "-of", "csv=p=0", clip,
  ]);
  return r.out.trim().split("\n").filter(Boolean).length;
}

/**
 * A still per lens, so the aimer has something to aim at. No stitching: each
 * lens is one mapped frame, wherever it happens to live.
 */
export async function extractLensFrames(clip, outDir, { at = null, size = 1536 } = {}) {
  await mkdir(outDir, { recursive: true });
  const seek = at ?? (await midpoint(clip));
  const src = await lensSources(clip);
  const out = {};
  for (const key of ["lens0", "lens1"]) {
    const dst = path.join(outDir, `${key}.jpg`);
    await runOk("ffmpeg", [
      "-v", "error",
      // -ss is an INPUT option: it applies to the next -i only. With the lenses
      // in two files, one -ss up front seeks the first and leaves the second at
      // t=0, so the aimer gets two different moments stitched into one frame.
      ...src.inputs.flatMap((f) => ["-ss", String(seek), "-i", f]),
      "-map", src[key],
      "-frames:v", "1",
      "-vf", `scale=${size}:${size}`,
      "-q:v", "5",
      dst, "-y",
    ]);
    out[key] = dst;
  }
  return { ...out, at: seek, layout: src.layout };
}

export const SCRUB_SCHEMA = "oio-scrub/1";

/**
 * A filmstrip: both lenses, sampled every `interval` seconds across the whole
 * clip, at two sizes (a full frame for the live dewarp preview, a small one
 * for the strip itself). One `-ss`-before-`-i` seek-and-grab per lens per
 * timestamp, run through a worker pool — cheap because a seek only has to
 * decode from the nearest keyframe, not the whole clip up to that point.
 *
 * Writes `manifest.json` last, once every frame is on disk, so its presence
 * is the ready signal a client can poll for.
 */
export async function extractScrubFrames(clip, outDir, {
  interval = 15, fullSize = 800, thumbSize = 120, concurrency = 8, onProgress,
} = {}) {
  await mkdir(outDir, { recursive: true });
  const dur = await duration(clip);
  const src = await lensSources(clip);
  const count = Math.max(1, Math.floor(dur / interval) + 1);

  const jobs = [];
  for (let i = 0; i < count; i++) {
    for (const key of ["lens0", "lens1"]) jobs.push({ i, t: i * interval, key });
  }

  let done = 0;
  await runPool(jobs, concurrency, async ({ i, t, key }) => {
    const { file, map } = singleLensSource(src, key);
    const idx = String(i + 1).padStart(4, "0");
    await runOk("ffmpeg", [
      "-v", "error",
      "-ss", String(t),
      "-i", file,
      "-filter_complex",
      `[${map}]split=2[a][b];[a]scale=${fullSize}:${fullSize}[full];[b]scale=${thumbSize}:${thumbSize}[thumb]`,
      "-map", "[full]", "-frames:v", "1", "-q:v", "5", path.join(outDir, `${key}_full_${idx}.jpg`),
      "-map", "[thumb]", "-frames:v", "1", "-q:v", "7", path.join(outDir, `${key}_thumb_${idx}.jpg`),
      "-y",
    ]);
    done++;
    onProgress?.(done, jobs.length);
  });

  const manifest = { schema: SCRUB_SCHEMA, clip: path.basename(clip), interval, fullSize, thumbSize, count, duration: dur };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

/** Null if there is no usable cached filmstrip at this path and interval. */
export async function readScrubManifest(outDir, interval) {
  try {
    const raw = await readFile(path.join(outDir, "manifest.json"), "utf8");
    const m = JSON.parse(raw);
    return m.interval === interval ? m : null;
  } catch {
    return null;
  }
}

/** Halfway in, so the still shows the run rather than the paddock. */
export async function midpoint(clip) {
  const dur = await duration(clip);
  return dur ? Math.round(dur / 2) : 0;
}

export async function duration(clip) {
  const r = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    clip,
  ]);
  const d = parseFloat(r.out.trim());
  return Number.isFinite(d) ? d : 0;
}

/** Dual-fisheye masters only: the `_10_` half and `.lrv` proxies are not inputs. */
export function isMaster(file) {
  const b = path.basename(file);
  // Equirect masters are .mp4, which a folder is also full of RENDERS of. So
  // anything this tool wrote is excluded by where it sits (renders/ and
  // render-previews/ are its own output directories) rather than by name -
  // names are typed by hand and drift, directories do not. Shape is confirmed
  // later by lensSources, which only treats a 2:1 single stream as a sphere;
  // a flat .mp4 that slips through here fails there with a clear reason.
  if (/\.(mp4|mov)$/i.test(b)) {
    return !/(^|\/)(renders|render-previews)(\/|$)/.test(path.dirname(file).replace(/\\/g, "/"))
      && !b.endsWith("_preview.mp4");
  }
  return file.endsWith(".insv") && !b.includes("_10_");
}

export async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
