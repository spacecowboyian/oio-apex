#!/usr/bin/env node
/**
 * 360-framer CLI.
 *
 *   aim     (--input <clip.insv> | --frames <dir>) [--aim <aim.json>] [--port 5173] [--at <sec>]
 *                               [--scrub-interval <sec=15>] [--no-scrub]
 *   render  --config <aim.json> (--input <clip>... | --input-dir <dir>)
 *                               [--shot <name>...] [--preview] [--dry-run] [--overwrite]
 *                               [--project <dir>] [--outdir <dir>]
 *                               [--label <text>] [--size <WxH>] [--bitrate <rate>]
 *                               [--start <sec>] [--duration <sec>]   test slice
 *
 * Finals land in `renders/` beside the clip they came from; previews pool in
 * `render-previews/` under the project (--project, default cwd).
 *   frames  --input <clip.insv> --outdir <dir> [--at <sec>]
 *   calibrate --input <clip.insv> [--pitch 35] [--from 180] [--to 210]
 *
 * Aim opens a local page; Save writes aim.json beside the footage. Render reads
 * that file, so the numbers that shipped the look are the numbers on disk.
 */
import path from "node:path";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { extractLensFrames, extractScrubFrames, readScrubManifest, isMaster, exists, lensSources } from "./frames.mjs";
import { startServer } from "./serve.mjs";
import { loadConfig, findClips, renderAll } from "./render.mjs";
import { resolveCamera, cameraList } from "./lens.mjs";
import { calibrate } from "./calibrate.mjs";

const REPEATABLE = new Set(["shot", "input"]);

function parseArgs(argv) {
  const out = { _: [], shot: [], input: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { out[key] = true; continue; }
    // --input repeats so a batch can name exactly the clips it wants; a folder
    // with one throwaway in it should not force --input-dir plus a delete.
    if (REPEATABLE.has(key)) out[key].push(next);
    else out[key] = next;
    i++;
  }
  return out;
}

const need = (v, msg) => {
  if (!v || v === true) { console.error(msg); process.exit(1); }
  return v;
};


/**
 * Where a clip's aim.json and clips.json live.
 *
 * Normally beside the clip. But footage is filed into a `source/` folder while
 * its configs and `renders/` stay one level up, and deriving the config path
 * from the clip's own directory would then miss them completely - the aimer
 * would open on a BLANK aim.json in `source/`, silently, and the first Save
 * would write a second config that shadows the real one.
 *
 * So: beside the clip if a config is actually there, otherwise the parent when
 * one is there. Only ever those two, and only when a config already exists -
 * for a folder with no config yet, the clip's own directory is still the answer.
 */
async function configDirFor(clip) {
  const here = path.dirname(clip);
  const stem = path.basename(clip, path.extname(clip));
  const names = ["aim.json", `${stem}.clips.json`];
  for (const dir of [here, path.dirname(here)]) {
    for (const n of names) {
      if (await exists(path.join(dir, n))) return dir;
    }
  }
  return here;
}

const cmds = {
  /**
   * Extract both lens stills and open the aimer.
   *
   * `--frames <dir>` reuses stills pulled earlier instead of the clip. Aiming
   * only ever touches two jpgs, so this keeps the aimer usable when the drive
   * holding the footage is not mounted.
   */
  async aim(args) {
    const framesDir = args.frames && args.frames !== true ? path.resolve(args.frames) : null;
    let frames;
    let clipName;
    let defaultAimDir;
    // The filmstrip needs the real clip to seek into, so it's only possible
    // when one was named and is actually readable - a --frames-only session
    // (LaCie unmounted, stills already pulled) can still aim, just not scrub.
    let clip = null;

    if (framesDir) {
      frames = { lens0: path.join(framesDir, "lens0.jpg"), lens1: path.join(framesDir, "lens1.jpg") };
      for (const p of [frames.lens0, frames.lens1]) {
        if (!(await exists(p))) {
          console.error(`Missing ${p}\nRun: 360-framer frames --input <clip.insv> --outdir ${framesDir}`);
          process.exit(1);
        }
      }
      // An aim belongs with the footage it aims, not with the scratch stills.
      // Only when --input names nothing real does the frames dir have to do.
      const named = args.input?.[0] ? path.resolve(args.input[0]) : null;
      const beside = named && (await exists(named));
      clip = beside ? named : null;
      clipName = named ? path.basename(named) : path.basename(framesDir);
      defaultAimDir = beside ? path.dirname(named) : framesDir;
      console.log(`stills from ${framesDir}`);
      if (named && !beside) console.log(`note: ${named} is not readable, so aim.json falls back to the stills dir`);
    } else {
      clip = path.resolve(need(args.input?.[0], "Missing --input <clip.insv> (or --frames <dir>)"));
      if (!(await exists(clip))) { console.error(`No such clip: ${clip}`); process.exit(1); }
      if (!isMaster(clip)) {
        console.error("That looks like the _10_ half or a proxy. Point at the dual-fisheye master.");
        process.exit(1);
      }
      const dir = await mkdtemp(path.join(tmpdir(), "360framer-"));
      process.stdout.write("extracting lens frames... ");
      frames = await extractLensFrames(clip, dir, { at: args.at ? Number(args.at) : null });
      console.log(`done (t=${frames.at}s)`);
      clipName = path.basename(clip);
      defaultAimDir = await configDirFor(clip);
    }

    const aimPath = path.resolve(args.aim || path.join(defaultAimDir, "aim.json"));
    const stem = path.basename(clipName, path.extname(clipName));
    const clipsPath = path.resolve(args.clips || path.join(defaultAimDir, `${stem}.clips.json`));
    const port = Number(args.port || 5173);
    const scrubInterval = Number(args["scrub-interval"] || 15);
    const wantScrub = clip && !args["no-scrub"];
    // Hidden and keyed by interval, next to aim.json - re-opening the same
    // clip at the same interval reuses the filmstrip instead of re-cutting it.
    const scrubDir = wantScrub ? path.join(defaultAimDir, `.scrub-${stem}-${scrubInterval}s`) : null;

    // Identify the body from the footage so the aimer opens on that camera's
    // calibration rather than whichever one happens to be the default.
    let camera = null;
    if (clip) {
      try {
        const src = await lensSources(clip);
        camera = src.camera;
        const c = camera.confidence === "measured" ? "" : ` [${camera.confidence}]`;
        console.log(`  camera: ${camera.label} - ${camera.ihFov}/${camera.ivFov}${c}`);
        if (camera.confidence !== "measured") {
          console.log(`  note: this calibration is not verified. Check it in the Lens panel and re-save.`);
        }
      } catch { /* single-lens or unreadable: fall through to defaults */ }
    }
    await startServer({ frames, aimPath, clipName, port, scrubDir, clipsPath, camera, clipPath: clip });
    const url = `http://localhost:${port}/`;
    console.log(`\n  ${url}`);
    console.log(`  Save writes -> ${aimPath}`);
    console.log("\n  ctrl-c when finished\n");
    spawn("open", [url], { stdio: "ignore" }).unref();

    if (wantScrub) {
      const cached = await readScrubManifest(scrubDir, scrubInterval);
      if (cached) {
        console.log(`  filmstrip: reusing ${cached.count} cached frame(s) every ${scrubInterval}s`);
      } else {
        console.log(`  filmstrip: cutting a frame every ${scrubInterval}s in the background (this can take a bit on a long clip)...`);
        extractScrubFrames(clip, scrubDir, { interval: scrubInterval })
          .then((m) => console.log(`  filmstrip: ready (${m.count} frame(s))`))
          .catch((e) => console.log(`  filmstrip: failed - ${e.message}`));
      }
    } else if (!clip) {
      console.log("  filmstrip: unavailable in --frames-only mode (no clip to seek into)");
    }
  },

  /** Render every shot in a config across one clip or a folder of them. */
  async render(args) {
    const cfgPath = path.resolve(need(args.config, "Missing --config <aim.json>"));
    const cfg = await loadConfig(cfgPath);

    let clips;
    if (args["input-dir"]) clips = await findClips(path.resolve(args["input-dir"]));
    else {
      need(args.input?.length, "Missing --input or --input-dir");
      clips = args.input.map((c) => path.resolve(c));
    }
    if (!clips.length) { console.error("No .insv masters found"); process.exit(1); }

    // --size overrides the config's output dimensions. The aim is a framing,
    // not a delivery spec: the same aim.json is rendered at 1080 for review and
    // at full size for a master, and neither should require editing the file.
    let size = null;
    if (args.size && args.size !== true) {
      const m = String(args.size).match(/^(\d+)x(\d+)$/);
      if (!m) { console.error(`--size wants WxH, e.g. 1920x1080 (got ${args.size})`); process.exit(1); }
      size = { width: Number(m[1]), height: Number(m[2]) };
    }

    const failures = await renderAll({
      cfg, cfgPath, clips,
      label: args.label && args.label !== true ? String(args.label) : null,
      start: args.start && args.start !== true ? Number(args.start) : null,
      duration: args.duration && args.duration !== true ? Number(args.duration) : null,
      size,
      bitrate: args.bitrate && args.bitrate !== true ? String(args.bitrate) : null,
      // Both default themselves per clip inside renderAll; --outdir overrides.
      outDir: args.outdir && args.outdir !== true ? args.outdir : null,
      project: args.project && args.project !== true ? args.project : null,
      shots: args.shot,
      preview: !!args.preview,
      dryRun: !!args["dry-run"],
      overwrite: !!args.overwrite,
    });
    if (failures.length) process.exit(1);
  },

  /** What bodies are configured, and how trustworthy each calibration is. */
  async cameras() {
    for (const c of cameraList()) {
      console.log(`${c.id}  ${c.label}`);
      console.log(`    ${c.ih_fov}/${c.iv_fov} ${c.model}, circle ${c.circle}  [${c.confidence}]`);
      console.log(`    matches: ${JSON.stringify(c.match)}`);
      if (c.notes) console.log(`    ${c.notes}`);
    }
  },

  /** Just the stills, for contact sheets or a quick look. */
  async frames(args) {
    const clip = path.resolve(need(args.input?.[0], "Missing --input <clip.insv>"));
    const outDir = path.resolve(need(args.outdir, "Missing --outdir <dir>"));
    await mkdir(outDir, { recursive: true });
    const r = await extractLensFrames(clip, outDir, { at: args.at ? Number(args.at) : null });
    console.log(`${r.lens0}\n${r.lens1}`);
  },

  /**
   * Measure a lens's true coverage instead of trusting the spec.
   * Renders the forward lens rectilinear and finds the ih_fov that stops a
   * distant horizon from bowing.
   */
  async calibrate(args) {
    const clip = path.resolve(need(args.input?.[0], "Missing --input <clip.insv>"));
    await calibrate(clip, {
      pitch: Number(args.pitch ?? 35),
      from: Number(args.from ?? 180),
      to: Number(args.to ?? 210),
    });
  },
};

const [, , cmd, ...rest] = process.argv;
if (!cmd || !cmds[cmd]) {
  console.error(`360-framer <command>

  aim        open the aimer on a clip; Save writes aim.json beside it
  cameras    list the lens profiles in cameras.json
  render     render shots from an aim.json across a clip or folder
  frames     dump both lens stills
  calibrate  measure a lens's true coverage from a horizon

Run a command with --help-ish flags per the header of src/cli.mjs.`);
  process.exit(1);
}
cmds[cmd](parseArgs(rest)).catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
