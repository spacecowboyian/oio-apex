/**
 * Shared plumbing for the narrated leaderboard recap pipeline.
 *
 * The pipeline is seven stages (see Brains
 * `projects/oio/projects/apex/canonical/social-leaderboard-recap-pipeline.md`).
 * Every stage that uses this module reads and writes ONE job manifest, so state
 * lives on disk: the stages run minutes and sometimes hours apart, often across
 * separate sessions. It also gives the build-record artifact a single thing to
 * render from instead of being hand-authored per event.
 *
 * Two stages sit outside it. `parse-results.mjs` writes a standalone leaderboard
 * config the manifest then points at, and `clip-layout.mjs` writes layout.json
 * from the browser — neither has a manifest to read yet when it runs.
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
  const json = /\{[\s\S]*?\n\}/.exec(stderr);   // non-greedy: two blocks in stderr must not merge
  if (!json) throw new Error(`loudnorm analysis produced no JSON for ${file}`);
  return JSON.parse(json[0]);
}

export async function ffprobe(args) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", ...args], { maxBuffer: 1 << 26 });
  return stdout.trim();
}

/**
 * Duration in seconds, or throw.
 *
 * ffprobe answers `N/A` for a container with no frames, which `Number()` turns
 * into NaN — and NaN then flows through every comparison as `false`, so a
 * zero-frame file reads as "no problem". It has to fail here.
 */
export async function duration(file) {
  const raw = await ffprobe(["-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) {
    throw new Error(`${path.basename(file)}: ffprobe reported duration "${raw || "(empty)"}" — the file has no usable frames`);
  }
  return seconds;
}

/**
 * Check a rendered file is the length it was asked to be.
 *
 * THE reason this exists: **ffmpeg exits 0 when it produces less footage than
 * you asked for.** Seek past the end of a clip and it writes a short file, or a
 * zero-frame one, and reports success. Nothing downstream notices, the concat
 * succeeds, and the result is a full-length video that drifts out of sync with
 * the narration partway through — wrong, but not obviously wrong, which is the
 * failure mode this whole pipeline is built to avoid.
 *
 * Default tolerance is one frame at 30fps. Anything looser hides a dropped
 * segment behind the phrase "rounding".
 */
export async function expectDuration(file, want, { tolerance = 1 / 30, label = "" } = {}) {
  const got = await duration(file);
  if (Math.abs(got - want) > tolerance) {
    throw new Error(
      `${label || path.basename(file)}: expected ${want.toFixed(3)}s but produced ${got.toFixed(3)}s ` +
      `(off by ${(got - want).toFixed(3)}s). ffmpeg exits 0 on a short cut, so this is checked rather than trusted.`,
    );
  }
  return got;
}

/**
 * Cards must tile the timeline with no gaps and no overlaps.
 *
 * Two stages read these and disagree if they do not: the board sums
 * `end - start` per card, while the footage track uses the distance between
 * consecutive `start`s. Contiguous cards make those identical; a 0.2s gap makes
 * the board and the footage drift apart from that card onward, which reads as
 * the board turning "slightly late" rather than as a bug.
 */
export function assertContiguousCards(cards) {
  if (!cards?.length) throw new Error("manifest.cards is empty");
  if (cards[0].start !== 0) {
    throw new Error(`manifest.cards[0].start is ${cards[0].start}, must be 0 — the footage track starts at zero regardless`);
  }
  for (const [i, c] of cards.entries()) {
    if (!Number.isFinite(c.start) || !Number.isFinite(c.end)) {
      throw new Error(`manifest.cards[${i}] (${c.id ?? "?"}) has a non-numeric start/end`);
    }
    if (c.end <= c.start) {
      throw new Error(`manifest.cards[${i}] (${c.id ?? "?"}) ends at or before it starts`);
    }
    const next = cards[i + 1];
    if (next && Math.abs(next.start - c.end) > 1e-6) {
      throw new Error(
        `manifest.cards[${i}] (${c.id ?? "?"}) ends at ${c.end} but the next card starts at ${next.start}. ` +
        `Cards must be contiguous or the board and the footage disagree about length.`,
      );
    }
  }
  return cards;
}

/**
 * Which clip covers which stretch of time.
 *
 * Shared because it was implemented twice — once in recap-render, once in
 * recap-artifact — and the two had already drifted: the renderer errored on an
 * unfillable slot while the build record silently dropped it, so the page could
 * show a plausible table for a schedule the renderer would have refused.
 *
 * The entry card holds several clips (they introduce the cars) split evenly
 * across it; every run card takes one; the last card takes the last clip.
 *
 * Throws on a duplicate assignment. That is not the same check as "is any slot
 * undefined": with exactly one clip too few, the last run card and the final
 * card resolve to the SAME clip, nothing is undefined, the spare list is empty,
 * and the same footage plays twice with no warning.
 */
export function scheduleClips(cards, clips, entryClips) {
  if (cards.length < 2) throw new Error(`need at least an entry and a final card, got ${cards.length}`);
  const bounds = [...cards.map((c) => c.start), cards[cards.length - 1].end];
  const runCards = cards.length - 2;
  const slots = [];

  const sub = (bounds[1] - bounds[0]) / entryClips;
  for (let i = 0; i < entryClips; i++) {
    slots.push({ start: bounds[0] + i * sub, end: bounds[0] + (i + 1) * sub, clip: clips[i], entryIndex: i });
  }
  for (let c = 1; c <= runCards; c++) {
    slots.push({ start: bounds[c], end: bounds[c + 1], clip: clips[entryClips + c - 1], card: cards[c] });
  }
  slots.push({
    start: bounds[cards.length - 1], end: bounds[cards.length],
    clip: clips[clips.length - 1], card: cards[cards.length - 1],
  });

  if (slots.some((s) => !s.clip)) {
    throw new Error(`the schedule needs ${slots.length} clips but the layout has ${clips.length}`);
  }
  const seen = new Map();
  for (const [i, s] of slots.entries()) {
    if (seen.has(s.clip)) {
      throw new Error(
        `slots ${seen.get(s.clip) + 1} and ${i + 1} both use ${s.clip.file}. ` +
        `The schedule needs ${slots.length} clips and the layout has ${clips.length}.`,
      );
    }
    seen.set(s.clip, i);
  }
  const spare = clips.filter((c) => !seen.has(c));
  return { slots, spare };
}

/** A CLI flag that must be a real number. `--flag` with no value yields NaN otherwise. */
export function finiteNumber(value, name, fallback) {
  if (value === undefined) return fallback;
  // Blank is rejected explicitly: Number("") is 0, not NaN, so an empty value
  // would silently become a zero penalty rather than an error.
  if (typeof value === "string" && value.trim() === "") {
    throw new Error(`--${name} needs a number, got an empty value`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`--${name} needs a number, got ${JSON.stringify(value)}`);
  return n;
}

// --- manifest -------------------------------------------------------------

export async function loadManifest(file) {
  const m = JSON.parse(await fs.readFile(file, "utf-8"));
  m.__file = file;
  m.__dir = path.dirname(path.resolve(file));
  return m;
}

/**
 * Write the manifest back, keeping a copy of what was there before.
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
  // Read and backup are separated deliberately. Wrapping both meant a failed
  // backup write (permissions, full disk) was indistinguishable from "there was
  // no previous file", and the manifest got overwritten anyway — the exact loss
  // this function exists to prevent.
  let prev = null;
  try {
    prev = await fs.readFile(file, "utf-8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  if (prev !== null) {
    const histDir = path.join(path.dirname(file), ".recap-history");
    await fs.mkdir(histDir, { recursive: true });
    // Distinct per save: the tag is the revision being REPLACED, so
    // manifest.json.3 holds what revision 3 looked like.
    const tag = stamp ?? String(out.revision ?? 0);
    await fs.writeFile(path.join(histDir, `${path.basename(file)}.${tag}`), prev);
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
 * So the search is confined to the contiguous run containing `t`: walk outward
 * and stop as soon as the level climbs `band` dB above the level AT `t`, then
 * take the minimum inside that run.
 *
 * The bound is relative to the seed, which is what makes it work and also what
 * bounds the guarantee: when `t` already sits in a gap, the walk cannot climb
 * out of it into a neighbouring word. When `t` sits on speech — an unsnapped
 * Whisper word time, say — the band is speech-relative and the walk is limited
 * mostly by `windowSeconds`. Callers pass cut points that are already in or
 * beside a gap, which is the case this protects. See test/recap-core.test.mjs.
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
  if (!I) {
    // Not "quiet file" — the measurement did not happen. Returning null here
    // silently suppressed the level advisory that exists to inform a decision,
    // exactly when the number behind that decision was missing.
    throw new Error(`could not measure loudness of ${path.basename(file)}; ffmpeg said:\n${stderr.trim().split("\n").slice(-4).join("\n")}`);
  }
  return { lufs: Number(I[1]), lra: LRA ? Number(LRA[1]) : null };
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
