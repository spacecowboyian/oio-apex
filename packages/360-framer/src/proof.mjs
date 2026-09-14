/**
 * Proof frames for the aimer: render the aim on screen through the REAL
 * pipeline and hand the picture back to the page.
 *
 * The section this feeds used to be a copyable ffmpeg command assembled in the
 * browser, and it was wrong in ways nothing on screen could reveal:
 *
 *   - it printed `INPUT.insv` and `OUT.mp4`, so it could not be run as shown;
 *   - it hard-coded `[0:v:0]`/`[0:v:1]`, which is the X4's both-lenses-in-one-
 *     file layout. On the X1, whose lenses live in two separate files, those
 *     labels name the same lens twice and the command renders nonsense;
 *   - it was a second implementation of `filterGraph`, so it could drift from
 *     what the CLI actually runs and nobody would find out until a render.
 *
 * Everything here is built from `filterGraph` and `lensSources` instead - the
 * same two functions `render.mjs` uses - and the command string is the exact
 * argv, shell-quoted. The proof frame runs that argv (with `-frames:v 1`), so
 * the picture on screen is evidence the command works rather than a promise.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveDenoise, filterGraph, coverage, checkLens, maskBuildArgs, IH_FOV, IV_FOV, LENS_MODEL } from "./lens.mjs";
import { lensSources, lensFrameSize } from "./frames.mjs";
import { run, runOk } from "./util.mjs";

/** POSIX-quote one argument, only when it needs it. */
function q(a) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(a) ? a : `'${String(a).replace(/'/g, `'\\''`)}'`;
}

/**
 * argv as a command someone can paste, wrapped at the arguments that carry
 * real weight (the inputs, the graph, the output) rather than at a column.
 */
export function shellCommand(cmd, argv) {
  const out = [cmd];
  for (const a of argv) {
    // Quoting is not cosmetic here: the filter graph is full of `[`, `'` and
    // `;`, and `-map [o]` is a glob to a shell. Pasted unquoted it either dies
    // or, worse, expands into something that runs and renders the wrong thing.
    const tok = q(a);
    if (a === "-i" || a === "-filter_complex" || a === "-vf" || a === "-map" || a === "-c:v") {
      out.push("\\\n  " + tok);
    } else {
      out.push(tok);
    }
  }
  return out.join(" ");
}

/**
 * One clip's lens layout plus a seam mask on disk, built once and kept.
 *
 * The mask is a constant for a given frame size and image circle - it does NOT
 * depend on the fields - and costs about six times the reprojection it feeds
 * when built inline per frame, so it is built once rather than rebuilt for
 * every nudge of a slider.
 */
export class ClipRenderer {
  constructor(clip) {
    this.clip = clip;
    this.sources = null;
    this.frame = null;
    this.dir = null;
    this.circle = 1.0;
    this.masks = new Map();
  }

  async ready() {
    if (!this.sources) {
      this.sources = await lensSources(this.clip);
      this.frame = await lensFrameSize(this.sources.inputs[0]);
      this.circle = this.sources.camera?.circle ?? 1.0;
      this.dir = await mkdtemp(path.join(tmpdir(), "360framer-aim-"));
    }
    return this;
  }

  // Keyed by `circle` alone: the mask marks the lit area, which does not move
  // when the fields do. See circleMaskExpr.
  async mask() {
    const key = String(this.circle);
    if (!this.masks.has(key)) {
      const dst = path.join(this.dir, `seam_${key}.png`);
      await runOk("ffmpeg", maskBuildArgs({
        width: this.frame.width, height: this.frame.height, circle: this.circle, dst,
      }));
      this.masks.set(key, dst);
    }
    return this.masks.get(key);
  }

  async dispose() {
    if (this.dir) await rm(this.dir, { recursive: true, force: true });
  }
}

/**
 * ffmpeg argv for one shot on this clip.
 *
 * `still` swaps the encode for a single JPEG at `t`; otherwise this is the
 * whole-clip render, and is what the page offers to copy. Both go through the
 * same `filterGraph`, so the proof frame cannot show something the copied
 * command would not produce.
 */
export function shotArgs({
  sources, shot, dst, width, height, projection = "sg",
  ihFov = IH_FOV, ivFov = IV_FOV, model = LENS_MODEL, circle = 1.0,
  maskPath = null, still = null, encode = {},
  // Resolved by the caller, same as in render.mjs. Threaded through so the
  // aimer's "Render frame" - the one honest preview of a denoise, since no
  // shader can mirror a neighbourhood filter - runs the SAME graph the CLI
  // will, rather than quietly showing an ungrained frame.
  denoise = null,
}) {
  // `source` is derived from the angles, never trusted - a stale one aims out
  // the BACK of that lens and renders a silent black frame.
  const cov = coverage(
    { hFov: shot.h_fov, yaw: shot.yaw, pitch: shot.pitch, roll: shot.roll },
    width / height,
    { ihFov, ivFov, projection },
  );
  const s = { ...shot, source: cov.source };
  const useMask = s.source === "dual" && maskPath;
  const graph = filterGraph(s, {
    denoise,
    width, height, projection, ihFov, ivFov, model, circle,
    src: sources,
    mask: useMask ? `${sources.inputs.length}:v` : null,
  });

  const argv = ["-v", "error"];
  // -ss goes before EVERY input, not once before the first.
  //
  // As an input option it applies to the next -i only. On the X4 there is one
  // file and one -ss, so it looked correct; on the X1, whose lenses are two
  // separate files, it seeked lens0 and left lens1 at t=0 - a dual shot then
  // blended two DIFFERENT MOMENTS together, and a single-lens shot on lens1
  // silently ignored the timestamp entirely. Nothing errors: you get a frame,
  // just not the one asked for.
  for (const f of sources.inputs) {
    if (still != null) argv.push("-ss", String(still));
    argv.push("-i", f);
  }
  if (useMask) argv.push("-i", maskPath);
  if (graph.complex) {
    argv.push("-filter_complex", graph.complex, "-map", graph.label);
    if (still == null) argv.push("-map", "0:a:0?");
  } else {
    argv.push("-map", graph.stream);
    if (still == null) argv.push("-map", "0:a:0?");
    argv.push("-vf", graph.vf);
  }
  if (still != null) {
    argv.push("-frames:v", "1", "-q:v", "3");
  } else {
    argv.push("-stats");   // a full clip takes minutes; run it blind and it looks hung
    argv.push(
      "-c:v", encode.vcodec ?? "hevc_videotoolbox",
      "-b:v", encode.bitrate ?? "60M",
      "-tag:v", encode.vtag ?? "hvc1",
      "-c:a", encode.acodec ?? "aac",
      "-b:a", encode.abitrate ?? "192k",
      "-movflags", "+faststart",
    );
  }
  argv.push(dst, "-y");
  return { argv, source: cov.source, dual: cov.dual };
}

/**
 * Render the aim on screen to a JPEG, and return it with the whole-clip
 * command that would produce the same framing at full size.
 *
 * @returns {{jpeg: Buffer|null, command: string, source: string, ms: number, error: string|null}}
 */
export async function proofFrame(rc, {
  shot, t = 0, width = 1280, height = 720, projection = "sg",
  ihFov, ivFov, model = LENS_MODEL, outWidth = 3840, outHeight = 2160,
  outPath = "OUT.mp4", encode = {}, dry = false, denoise = undefined,
}) {
  await rc.ready();
  // A sub-180 field is impossible geometry, not a preference: it leaves a band
  // of sphere neither lens saw and renders a black wedge. Corrected here so a
  // proof can never quietly show one.
  const lens = checkLens({ ihFov, ivFov, camera: rc.sources.camera ?? null });
  // Same resolution rule as the CLI: the shot's own block, else the body's
  // default. Without this the proof would silently skip a denoise the render
  // is going to apply, which is the drift this button exists to catch.
  const dn = denoise !== undefined ? denoise : resolveDenoise(shot, rc.sources.camera ?? null);

  // Shown command: the FULL-SIZE clip render, because that is the thing
  // someone would actually want to run. Same graph, different encode.
  //
  // Deliberately built WITHOUT a prebuilt mask, unlike the proof frame and the
  // CLI. The prebuilt mask is a temp file that exists only inside this process,
  // so a command referring to it would paste as a command that cannot run -
  // which is the exact failure this section had before. The inline mask makes
  // it self-contained; `360-framer render` is the faster way to run the same
  // graph in bulk.
  const full = shotArgs({
    sources: rc.sources, shot, dst: outPath,
    width: outWidth, height: outHeight, projection,
    ihFov: lens.ihFov, ivFov: lens.ivFov, model, circle: rc.circle,
    maskPath: null, encode, denoise: dn,
  });
  const command = shellCommand("ffmpeg", full.argv);
  if (dry) {
    return { jpeg: null, command, source: full.source, ms: 0, error: null, note: lens.note };
  }

  const maskPath = await rc.mask();
  const dst = path.join(rc.dir, "proof.jpg");
  const still = shotArgs({
    sources: rc.sources, shot, dst,
    width, height, projection,
    ihFov: lens.ihFov, ivFov: lens.ivFov, model, circle: rc.circle,
    maskPath, still: t, denoise: dn,
  });
  const t0 = Date.now();
  const r = await run("ffmpeg", still.argv, { timeoutMs: 120000 });
  const ms = Date.now() - t0;
  if (r.code !== 0) {
    return { jpeg: null, command, source: still.source, ms, error: r.err.slice(-400) || `ffmpeg exited ${r.code}`, note: lens.note };
  }
  let jpeg = null;
  try {
    jpeg = await readFile(dst);
  } catch (e) {
    return { jpeg: null, command, source: still.source, ms, error: String(e), note: lens.note };
  }
  return { jpeg, command, source: still.source, ms, error: null, note: lens.note };
}
