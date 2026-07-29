/**
 * Shared plumbing for the narrated leaderboard recap pipeline.
 *
 * The pipeline is seven stages (see Brains
 * `projects/oio/projects/apex/canonical/social-leaderboard-recap-pipeline.md`)
 * and every stage reads and writes ONE job manifest. That is deliberate: the
 * stages run minutes and sometimes hours apart, often across separate sessions,
 * so the state has to live on disk rather than in anyone's head. It also gives
 * the build-record artifact a single thing to render from instead of being
 * hand-authored per event.
 *
 * Nothing here is event-specific. Paths come from the manifest.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

/** ffmpeg, quiet, overwrite. Throws with stderr attached on failure. */
export async function ffmpeg(args) {
  try {
    return await execFileAsync("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 1 << 28 });
  } catch (err) {
    throw new Error(`ffmpeg failed\n  ${args.join(" ")}\n${err.stderr ?? err.message}`);
  }
}

/**
 * Run ffmpeg purely to read its stderr.
 *
 * The measurement filters (ebur128, loudnorm's analysis pass, astats) print
 * their results to stderr and the exit status is not meaningful, so this
 * resolves either way rather than throwing.
 */
export async function ffmpegStderr(args) {
  try {
    const { stderr } = await execFileAsync("ffmpeg", ["-hide_banner", ...args], { maxBuffer: 1 << 26 });
    return stderr ?? "";
  } catch (err) {
    return err.stderr ?? "";
  }
}

/** Parse the JSON blob loudnorm's analysis pass prints to stderr. */
export async function loudnormAnalyse(file, chain, target) {
  const filter = [chain, `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:print_format=json`]
    .filter(Boolean).join(",");
  const stderr = await ffmpegStderr(["-i", file, "-af", filter, "-f", "null", "/dev/null"]);
  const json = /\{[\s\S]*\}/.exec(stderr);
  if (!json) throw new Error(`loudnorm analysis produced no JSON for ${file}`);
  return JSON.parse(json[0]);
}

export async function ffprobe(args) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", ...args], { maxBuffer: 1 << 26 });
  return stdout.trim();
}

export async function duration(file) {
  return Number(await ffprobe(["-show_entries", "format=duration", "-of", "csv=p=0", file]));
}

// --- manifest -------------------------------------------------------------

export async function loadManifest(file) {
  const m = JSON.parse(await fs.readFile(file, "utf-8"));
  m.__file = file;
  m.__dir = path.dirname(path.resolve(file));
  return m;
}

/**
 * Write the manifest back, keeping a timestamped copy of what was there before.
 *
 * The backup is not paranoia: Ian's clip layout was destroyed twice during
 * development because a tool wrote over it with no history, and the loss could
 * not be proven either way afterwards. Anything that writes a file a human
 * edited keeps a copy.
 */
export async function saveManifest(m, stamp) {
  const file = m.__file;
  const out = { ...m };
  delete out.__file;
  delete out.__dir;
  try {
    const prev = await fs.readFile(file, "utf-8");
    const histDir = path.join(path.dirname(file), ".recap-history");
    await fs.mkdir(histDir, { recursive: true });
    const tag = stamp ?? String(out.revision ?? "prev");
    await fs.writeFile(path.join(histDir, `${path.basename(file)}.${tag}`), prev);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  out.revision = (out.revision ?? 0) + 1;
  await fs.writeFile(file, JSON.stringify(out, null, 2) + "\n");
  m.revision = out.revision;
  return out.revision;
}

/** Resolve a manifest-relative path against the manifest's own directory. */
export function resolve(m, p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.resolve(m.__dir, p);
}

// --- audio analysis -------------------------------------------------------

/** Decode to mono 48k signed 16-bit PCM and return it as an Int16Array. */
export async function decodePcm(file, sampleRate = 48000) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-ac", "1", "-ar", String(sampleRate), "-f", "s16le", "-"],
    { maxBuffer: 1 << 30, encoding: "buffer" },
  );
  return new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
}

/**
 * Short-window RMS envelope in dBFS, one value per `hop` seconds.
 * Used to find real silence rather than trusting a transcript's word boundaries.
 */
export function rmsEnvelope(pcm, { sampleRate = 48000, hop = 0.01, window = 0.03 } = {}) {
  const H = Math.round(hop * sampleRate);
  const W = Math.round(window * sampleRate);
  const env = [];
  for (let i = 0; i + W < pcm.length; i += H) {
    let sum = 0;
    for (let j = i; j < i + W; j++) sum += pcm[j] * pcm[j];
    const rms = Math.sqrt(sum / W);
    env.push(rms > 0 ? 20 * Math.log10(rms / 32768) : -99);
  }
  return { env, hop };
}

/**
 * Snap a cut point to the quietest moment in the gap it already sits in.
 *
 * Whisper's word start/end times sit on the speech, not in the gap, so cutting
 * on them clips consonants. Worse, the gap between two phrases is often breath
 * rather than true silence, so "find silence" by absolute threshold fails. The
 * local minimum is the honest answer for where the gap is quietest.
 *
 * But a plain window minimum is not safe. Speech has dips BETWEEN PHONEMES that
 * can be quieter than the gap between words, so an unconstrained search will
 * happily jump across a whole syllable and cut inside the neighbouring word.
 * That is not hypothetical: on KCRX E5 it moved a cut from 85.18 to 84.94,
 * landing in the middle of the preceding "there" and stuttering the join.
 *
 * So the search is confined to the contiguous quiet run containing `t`: walk
 * outward and stop as soon as the level climbs `band` dB above where it
 * started, which is the edge of the current gap. Within that run, take the
 * minimum. The cut can settle, but it cannot cross a syllable to do it.
 */
export function snapToQuiet(env, hop, t, windowSeconds = 0.25, band = 6) {
  const at = Math.min(env.length - 1, Math.max(0, Math.round(t / hop)));
  if (env.length === 0) return { t, db: -99 };
  const limit = env[at] + band;
  const maxSteps = Math.round(windowSeconds / hop);

  let lo = at;
  for (let i = 0; i < maxSteps && lo - 1 >= 0 && env[lo - 1] <= limit; i++) lo--;
  let hi = at;
  for (let i = 0; i < maxSteps && hi + 1 < env.length && env[hi + 1] <= limit; i++) hi++;

  let best = at;
  for (let i = lo; i <= hi; i++) if (env[i] < env[best]) best = i;
  return { t: best * hop, db: env[best] };
}

/** Integrated loudness and loudness range, via ebur128. */
export async function loudness(file) {
  const stderr = await ffmpegStderr(["-nostats", "-i", file, "-af", "ebur128=framelog=quiet", "-f", "null", "/dev/null"]);
  const I = /^\s*I:\s*(-?[\d.]+)/m.exec(stderr);
  const LRA = /^\s*LRA:\s*(-?[\d.]+)/m.exec(stderr);
  return { lufs: I ? Number(I[1]) : null, lra: LRA ? Number(LRA[1]) : null };
}

/** True peak in dBTP, from loudnorm's analysis pass over the unprocessed file. */
export async function truePeak(file) {
  const { input_tp: tp } = await loudnormAnalyse(file, null, { I: -14, TP: -1, LRA: 7 });
  return Number(tp);
}

// --- misc -----------------------------------------------------------------

export const round = (n, places = 3) => Number(n.toFixed(places));

/** Build an ffmpeg concat-demuxer list file and return its path. */
export async function writeConcatList(dir, files, name = "concat.txt") {
  const p = path.join(dir, name);
  await fs.writeFile(p, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  return p;
}

export function usage(message) {
  console.error(message);
  process.exit(1);
}
