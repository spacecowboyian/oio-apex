/** Turn an aim config into rendered flat views. */
import { copyFile, mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { filterGraph, coverage, checkLens, maskBuildArgs, resolveDenoise, denoiseIsIdentity, IH_FOV, IV_FOV, LENS_MODEL } from "./lens.mjs";
import { isMaster, exists, lensSources, lensFrameSize } from "./frames.mjs";
import { audioGraph, audioIsIdentity, detectWhistle, MGB_WHISTLE } from "./audio.mjs";
import { runLive, runOk } from "./util.mjs";

export const SCHEMA = "oio-reframe/1";

/** Whether an audio block with no explicit `notch` should measure for one. */
const AUDIO_AUTO = true;

export async function loadConfig(file) {
  const cfg = JSON.parse(await readFile(file, "utf8"));
  if (cfg.schema !== SCHEMA) {
    console.warn(`warning: expected schema ${SCHEMA}, got ${JSON.stringify(cfg.schema)}`);
  }
  if (!Array.isArray(cfg.shots) || !cfg.shots.length) {
    throw new Error("config has no shots");
  }
  return cfg;
}

/** Every dual-fisheye master under a folder, recursively. */
export async function findClips(dir) {
  const out = [];
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (isMaster(p)) out.push(p);
    }
  }
  await walk(dir);
  return out.sort();
}

/**
 * ffmpeg argv for one clip + one shot.
 *
 * Single-lens shots are a plain stream map. A shot that crosses the seam has to
 * stack both lenses and let v360 treat them as one dual-fisheye frame.
 */
export function buildArgs(cfg, shot, sources, dst, { preview = false, maskPath = null, size = null, bitrate = null, start = null, duration = null, notch = undefined } = {}) {
  const out = cfg.output ?? {};
  const enc = cfg.encode ?? {};
  // --size wins over the config, which wins over the 4K default. An aim is a
  // framing, not a delivery spec - the same file gets rendered at review size
  // and at master size without being edited in between.
  const width = size?.width ?? (preview ? 1920 : Number(out.width ?? 3840));
  const height = size?.height ?? (preview ? 1080 : Number(out.height ?? 2160));
  const projection = out.projection ?? "sg";
  // Calibration is validated, not trusted - a sub-180 field is impossible
  // geometry, not a stylistic choice. Said out loud once per run.
  const { ihFov, ivFov, note } = checkLens({
    ihFov: cfg.lens?.ih_fov ?? IH_FOV,
    ivFov: cfg.lens?.iv_fov ?? cfg.lens?.ih_fov ?? IV_FOV,
    camera: sources.camera ?? null,
  });
  if (note && !buildArgs._warned) {
    console.log(`  note: ${note}`);
    buildArgs._warned = true;
  }

  // `source` is derived, not trusted — same rule as v_fov. A stored source that
  // disagrees with the angles (hand-edited config, or a calibration changed
  // since the aim was saved) points the view out the BACK of that lens and
  // renders a silent black frame, so it is recomputed and the disagreement said
  // out loud rather than shipped.
  // On an equirect the stored `source` is LEFT ALONE. It still matters - the
  // lens0 shots carry a +180 yaw flip that the aim depends on - but coverage()
  // answers "which lens could see this", and a stitched sphere has no lenses to
  // choose between. Recomputing there would overwrite a meaningful field with
  // an answer to a question that no longer applies, and a shot flipped to
  // "dual" would then build a two-lens graph over a one-stream input.
  const isEquirect = !!sources.equirect;
  if (!isEquirect) {
    const cov = coverage(
      { hFov: shot.h_fov, yaw: shot.yaw, pitch: shot.pitch, roll: shot.roll },
      width / height,
      { ihFov, ivFov, projection },
    );
    if (shot.source && shot.source !== cov.source) {
      console.log(
        `  note: "${shot.name}" says source ${shot.source} but its angles need ${cov.source} — using ${cov.source}`,
      );
    }
    shot = { ...shot, source: cov.source };
  }

  // Grain reduction is per body by default (the speckle belongs to the sensor,
  // not the shot) and overridable per shot. Said out loud, like the audio
  // notch: it is the only step the aimer's live preview does not show, so the
  // log is where you find out it happened.
  const denoise = resolveDenoise(shot, sources.camera ?? null);
  if (!denoiseIsIdentity(denoise) && !buildArgs._denoiseSaid) {
    const bits = [];
    if (denoise.chroma > 0) bits.push(`chroma ${denoise.chroma}`);
    if (denoise.luma > 0) bits.push(`luma ${denoise.luma}`);
    if (denoise.extra) bits.push(String(denoise.extra));
    console.log(`  denoise: ${bits.join(", ")} - applied before the grade, not shown in the aimer preview`);
    buildArgs._denoiseSaid = true;
  }

  // The prebuilt seam mask, when there is one, is the input after the lenses.
  const useMask = !isEquirect && shot.source === "dual" && maskPath;
  const graph = filterGraph(shot, {
    width,
    height,
    projection,
    ihFov,
    ivFov,
    model: cfg.lens?.model ?? LENS_MODEL,
    circle: sources.camera?.circle ?? 1.0,
    denoise,
    equirect: isEquirect,
    src: sources,
    mask: useMask ? `${sources.inputs.length}:v` : null,
  });

  // One -i per file the lenses live in: one on the X4, two on a body that
  // splits them. Audio always comes off the first input.
  // -ss goes before EVERY input, not once before the first: as an input option
  // it applies only to the next -i, so on a body that splits its lenses across
  // two files a single -ss seeks lens0 and leaves lens1 at zero, and a dual
  // shot then blends two different moments with no error anywhere.
  const seek = start != null ? ["-ss", String(start)] : [];
  const args = ["-v", "error", "-stats", ...sources.inputs.flatMap((f) => [...seek, "-i", f])];
  // No -loop: one frame is enough, framesync repeats it, and letting it reach
  // EOF is what allows the graph to finish.
  if (useMask) args.push("-i", maskPath);

  // Audio treatment is per shot, same as colour. It needs `acrossover`, which
  // has three outputs, so it cannot ride in a simple -af chain - and ffmpeg
  // will not accept -vf alongside -filter_complex. So when audio is being
  // processed, the video goes into the complex graph too, even for a
  // single-lens shot that would otherwise be a plain -vf.
  // `notch: "auto"` is resolved once per clip by the caller, from the clip's own
  // spectrum - the whistle belongs to a car, not to a shot, so measuring it per
  // shot would ask the same question three times and get the same answer.
  const ab = { ...(cfg.audio ?? {}), ...(shot.audio ?? {}) };
  if (ab.notch === "auto") ab.notch = notch === undefined ? null : notch;
  const audio = audioIsIdentity(ab) ? null : audioGraph(ab, { src: "0:a:0", out: "a" });
  if (audio) {
    const vpart = graph.complex ?? `[${graph.stream}]${graph.vf}[vout]`;
    const vlabel = graph.complex ? graph.label : "[vout]";
    args.push("-filter_complex", `${vpart};${audio}`, "-map", vlabel, "-map", "[a]");
  } else if (graph.complex) {
    args.push("-filter_complex", graph.complex, "-map", graph.label, "-map", "0:a:0?");
  } else {
    args.push("-map", graph.stream, "-map", "0:a:0?", "-vf", graph.vf);
  }
  // -t AFTER every -i, so it limits the OUTPUT. Placed before an input it is an
  // input option instead, and the only input it would have trimmed here is the
  // single-frame seam mask - which silently does nothing to the render length,
  // so a dual shot ran to the end of the clip while a single-lens one stopped
  // correctly. The asymmetry is the tell.
  if (duration != null) args.push("-t", String(duration));
  args.push(
    "-c:v", preview ? "h264_videotoolbox" : enc.vcodec ?? "hevc_videotoolbox",
    "-b:v", bitrate ?? (preview ? "6M" : enc.bitrate ?? "60M"),
    "-tag:v", preview ? "avc1" : enc.vtag ?? "hvc1",
    "-c:a", enc.acodec ?? "aac",
    "-b:a", enc.abitrate ?? "192k",
    "-movflags", "+faststart",
    dst, "-y",
  );
  return args;
}

export const PREVIEW_DIR = "render-previews";
export const RENDER_DIR = "renders";

/**
 * Where a render belongs.
 *
 * The two kinds of output want opposite things. A final is a deliverable and
 * belongs with the footage it came from, so it lands in `renders/` beside the
 * clip - one folder per source folder, which survives a batch across many
 * clip folders. A preview is scratch, gets watched once and replaced, and is
 * far more useful pooled in one place, so the whole run lands in the project's
 * `render-previews/`.
 *
 * An explicit --outdir always wins over both.
 */
export function outDirFor(clip, { preview, project, outDir, cfgDir = null }) {
  if (outDir) return path.resolve(outDir);
  if (preview) return path.join(path.resolve(project ?? process.cwd()), PREVIEW_DIR);
  // Beside the CONFIG, not beside the clip. Footage is filed into a `source/`
  // folder while its aim.json and renders/ stay one level up, so deriving this
  // from the clip would bury finals in `source/renders/` - away from the
  // renders already there, and away from the aim that produced them.
  return path.join(cfgDir ?? path.dirname(path.resolve(clip)), RENDER_DIR);
}

/**
 * Render every (clip x shot) pair.
 * The config is copied next to the outputs, so a render always carries the aim
 * that produced it.
 */
export async function renderAll({
  cfg, cfgPath, clips, outDir, project, shots, preview, dryRun, overwrite,
  // Goes into every filename between the clip stem and the shot name. Whose
  // car it is is not derivable from the clip - the X4 wrote the same filename
  // pattern for every driver that day - so it is passed in and written down
  // rather than guessed at from a folder name at read time.
  label = null, size = null, bitrate = null,
  // A test render should be a slice, not a whole 12-minute clip.
  start = null, duration = null,
}) {
  const picked = shots?.length
    ? cfg.shots.filter((s) => shots.includes(s.name))
    : cfg.shots;
  if (!picked.length) throw new Error(`no shots named ${JSON.stringify(shots)} in the config`);

  const cfgDir = cfgPath ? path.dirname(path.resolve(cfgPath)) : null;
  const dirs = new Set(clips.map((c) => outDirFor(c, { preview, project, outDir, cfgDir })));
  if (!dryRun) {
    for (const d of dirs) {
      await mkdir(d, { recursive: true });
      if (cfgPath) await copyFile(cfgPath, path.join(d, "aim.json"));
    }
  }

  const total = clips.length * picked.length;
  console.log(
    `${clips.length} clip(s) x ${picked.length} shot(s) = ${total} render(s)` +
      `${dryRun ? " [dry run]" : ""}${preview ? " [1080p preview]" : ""}`,
  );
  for (const d of dirs) console.log(`  -> ${d}`);
  console.log("");

  const failures = [];
  let n = 0;
  for (const clip of clips) {
    const dir = outDirFor(clip, { preview, project, outDir, cfgDir });
    let sources;
    try {
      sources = await lensSources(clip);
    } catch (e) {
      // A missing second lens is the clip's problem, not the run's.
      n += picked.length;
      failures.push({ clip: path.basename(clip), shot: "*", code: e.message });
      console.log(`[${n}/${total}] ${path.basename(clip)}  SKIPPED: ${e.message}`);
      continue;
    }
    // One mask per clip, built once and reused by every dual shot on it.
    // Built unconditionally rather than only when a shot claims to be dual:
    // `source` is recomputed per shot and a stored one may be wrong, which is
    // the whole reason buildArgs re-derives it. Costs about half a second.
    let maskPath = null;
    // An equirect has no seam, so there is nothing to mask - and building one
    // anyway would rasterise a 7680x3840 circle per clip for nothing.
    if (!dryRun && !sources.equirect) {
      try {
        const { width: mw, height: mh } = await lensFrameSize(sources.inputs[0]);
        // Not a function of the fields: the mask marks where the glass put
        // light, which is a round circle whatever the calibration claims. See
        // circleMaskExpr - deriving it from ih/iv made it an ellipse and tore a
        // hole in the seam the moment the two differed.
        maskPath = path.join(await mkdtemp(path.join(tmpdir(), "360framer-mask-")), "seam.png");
        await runOk("ffmpeg", maskBuildArgs({
          width: mw, height: mh, circle: sources.camera?.circle ?? 1.0, dst: maskPath,
        }));
      } catch (e) {
        // Not fatal: filterGraph builds the mask inline instead, just slower.
        console.log(`  note: could not prebuild the seam mask (${e.message}); falling back to the slow inline mask`);
        maskPath = null;
      }
    }

    // One whistle measurement per clip, before its shots. Only when something
    // actually asks for "auto" - a config with audio off should not pay for a
    // 60-second decode it will not use.
    let notch;
    if (!dryRun && picked.some((sh) => {
      const ab = { ...(cfg.audio ?? {}), ...(sh.audio ?? {}) };
      return !audioIsIdentity(ab) && (ab.notch === "auto" || (ab.notch === undefined && AUDIO_AUTO));
    })) {
      try {
        const d = await detectWhistle(clip);
        notch = d.present ? MGB_WHISTLE : null;
        console.log(
          `  audio: 11-14kHz is ${d.share == null ? "unmeasurable" : d.share.toFixed(1) + "% of the >4kHz energy"}` +
          ` - ${d.present ? "notching the whistle" : "no whistle, leaving the top alone"}`,
        );
      } catch (e) {
        notch = null;
        console.log(`  audio: could not measure the whistle (${e.message}); leaving the top alone`);
      }
    }

    for (const shot of picked) {
      n++;
      const stem = path.basename(clip, path.extname(clip));
      const tag = [stem, label, shot.name].filter(Boolean).join("_");
      const dst = path.join(dir, `${tag}${preview ? "_preview" : ""}.mp4`);
      const line = `[${n}/${total}] ${path.basename(clip)} -> ${path.basename(dst)}`;

      if (!dryRun && !overwrite && (await exists(dst))) {
        console.log(`${line}  (exists, skipping)`);
        continue;
      }
      const args = buildArgs(cfg, shot, sources, dst, { preview, maskPath, size, bitrate, start, duration, notch });
      if (dryRun) {
        console.log(`${line}\n  ffmpeg ${args.join(" ")}\n`);
        continue;
      }
      console.log(line);
      const code = await runLive("ffmpeg", args);
      if (code !== 0) {
        failures.push({ clip: path.basename(clip), shot: shot.name, code });
        console.log(`  FAILED (exit ${code})`);
      }
    }
  }

  if (failures.length) {
    console.log(`\n${failures.length} render(s) failed:`);
    for (const f of failures) console.log(`  ${f.clip} [${f.shot}] ${f.code}`);
  } else if (!dryRun) {
    console.log(`\ndone`);
    for (const d of dirs) console.log(`  ${d}`);
  }
  return failures;
}
