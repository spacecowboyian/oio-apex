#!/usr/bin/env node
/**
 * Stage 5 of the narrated recap: turn a raw read into the finished voiceover.
 *
 * Cuts the flubs out to a keeper list, then renders TWO versions, because the
 * choice between them is Ian's and the numbers do not make it for him:
 *
 *   vo-straight.wav   pure gain to -1 dBTP. No EQ, no compression. Ian's
 *                     standing preference is that the raw mic beats mastering.
 *   vo-mastered.wav   the retuned chain, normalised to -14 LUFS.
 *
 * The reason both exist: Ian's preference is about TONE and does not solve
 * LEVEL. A straight KCRX E5 cut measured -24.2 LUFS against the -14 platforms
 * expect, and with a median peak of -23 dB, closing that needs +13.4 dB, which
 * puts most of the read against the ceiling. That is arithmetic, not taste, so
 * the script refuses to pick and prints both sets of numbers instead.
 *
 * The mastering chain is tuned to Ian's notes on the stock audio-mastering-cli
 * chain ("compression really bites", "hiss on the top end"), and both
 * complaints were verified as real before being fixed:
 *   - the stock chain BOOSTS +1 dB at 12k, measurably making the hiss he was
 *     complaining about worse (8-16k sat 0.5 dB hotter than the raw mic).
 *     Replaced with a -4.5 dB shelf above 7.5k, landing 1.5 dB below raw.
 *   - the stock compressor idled at median 0.00 dB but grabbed up to 3.32 dB on
 *     transients with an 18ms attack, which is exactly what "bites" describes.
 *     At 1.4:1 / -12 dB / 50ms it maxes out at 0.09 dB, i.e. inert.
 *
 * Usage: node scripts/recap-vo.mjs <manifest.json>
 *
 * Reads  manifest.audio.raw        path to the take
 *        manifest.audio.keepers[]  [{ in, out, note }] in FINAL order
 *        manifest.audio.tail       optional hard trim of the assembled read
 * Writes manifest.audio.straight / .mastered / .duration / .measured
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  ffmpeg, loadManifest, saveManifest, resolve, decodePcm, rmsEnvelope,
  snapToQuiet, loudness, loudnormAnalyse, truePeak, duration, round,
  writeConcatList, usage,
} from "./recap-core.mjs";

const [manifestPath] = process.argv.slice(2);
if (!manifestPath) usage("Usage: node scripts/recap-vo.mjs <manifest.json>");

const m = await loadManifest(manifestPath);
const audio = m.audio ?? {};
if (!audio.raw) usage("manifest.audio.raw is required (the recorded take)");
if (!audio.keepers?.length) usage("manifest.audio.keepers is required (see stage 5)");

const raw = resolve(m, audio.raw);
const work = resolve(m, m.work ?? ".");
const outDir = path.join(work, "vo");
await fs.mkdir(outDir, { recursive: true });

const SNAP_WINDOW = audio.snapWindow ?? 0.25;
const FADE = audio.fade ?? 0.02;

// --- snap every cut to real silence ---------------------------------------
// Cutting on a transcript's word boundaries clips consonants, and the gap
// between phrases is often breath rather than silence. Snap first, then fade,
// which covers the joins that land in breath anyway.
console.log(`Analysing ${path.basename(raw)}...`);
const pcm = await decodePcm(raw);
const { env, hop } = rmsEnvelope(pcm);
const sorted = [...env].sort((a, b) => a - b);
const floor = sorted[Math.floor(0.1 * sorted.length)];
const speech = sorted[Math.floor(0.95 * sorted.length)];
console.log(`  floor ${floor.toFixed(1)} dB, speech ${speech.toFixed(1)} dB\n`);

const segDir = path.join(outDir, "segments");
await fs.rm(segDir, { recursive: true, force: true });
await fs.mkdir(segDir, { recursive: true });

const cut = [];
const files = [];
for (const [i, k] of audio.keepers.entries()) {
  const a = snapToQuiet(env, hop, k.in, SNAP_WINDOW);
  const b = snapToQuiet(env, hop, k.out, SNAP_WINDOW);
  const dur = round(b.t - a.t);
  if (dur <= 2 * FADE) usage(`keeper ${i} collapsed to ${dur}s after snapping`);

  const file = path.join(segDir, `${String(i).padStart(2, "0")}.wav`);
  await ffmpeg([
    "-ss", String(a.t), "-t", String(dur), "-i", raw,
    "-af", `afade=t=in:st=0:d=${FADE},afade=t=out:st=${round(dur - FADE)}:d=${FADE}`,
    "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", file,
  ]);
  files.push(file);
  cut.push({ ...k, in: round(a.t), out: round(b.t), seconds: dur, inDb: round(a.db, 1), outDb: round(b.db, 1) });

  const flag = Math.max(a.db, b.db) > floor + 10 ? "  (breath, not silence — faded)" : "";
  console.log(
    `  ${String(i).padStart(2)}  ${a.t.toFixed(2)} -> ${b.t.toFixed(2)}  ${dur.toFixed(2)}s` +
    `  ${(k.note ?? "").padEnd(34)}${flag}`,
  );
}

// --- assemble --------------------------------------------------------------
const listFile = await writeConcatList(segDir, files);
const assembled = path.join(outDir, "assembled.wav");
await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", assembled]);

let read = assembled;
if (audio.tail) {
  read = path.join(outDir, "read.wav");
  await ffmpeg([
    "-i", assembled, "-t", String(audio.tail),
    "-af", `afade=t=out:st=${round(audio.tail - 0.3)}:d=0.3`,
    "-c:a", "pcm_s24le", read,
  ]);
}
const readSeconds = round(await duration(read));
console.log(`\nassembled read: ${readSeconds}s`);

// --- version A: pure gain, no processing ----------------------------------
const gain = round(-1.0 - (await truePeak(read)), 2);
const straight = path.join(outDir, "vo-straight.wav");
await ffmpeg(["-i", read, "-af", `volume=${gain}dB`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", straight]);

// --- version B: the retuned master ----------------------------------------
const CHAIN = [
  "highpass=f=28",
  "lowpass=f=16000",
  "equalizer=f=90:t=q:w=1.0:g=0.8",
  "equalizer=f=280:t=q:w=1.1:g=-1.2",
  "equalizer=f=3500:t=q:w=1.0:g=1.3",
  "highshelf=f=7500:g=-4.5",
  "acompressor=threshold=-12dB:ratio=1.4:attack=50:release=250:makeup=1.5",
  "alimiter=limit=0.95:attack=5:release=200:level=disabled",
].join(",");
const TARGET = { I: -14, TP: -1.0, LRA: 7 };

// Two-pass loudnorm. Single-pass is an estimate and lands ~2 LUFS off, which is
// audible and was wrong on the first attempt at this.
const measured = await loudnormAnalyse(read, CHAIN, TARGET);

const mastered = path.join(outDir, "vo-mastered.wav");
await ffmpeg([
  "-i", read, "-af",
  `${CHAIN},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}` +
  `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}` +
  `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}` +
  `:offset=${measured.target_offset}:linear=true`,
  "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", mastered,
]);

// --- report ---------------------------------------------------------------
const ls = await loudness(straight);
const lm = await loudness(mastered);
console.log(`\n${"version".padEnd(14)}${"LUFS".padStart(8)}${"LRA".padStart(7)}`);
console.log(`${"straight".padEnd(14)}${String(ls.lufs).padStart(8)}${String(ls.lra).padStart(7)}   pure gain ${gain > 0 ? "+" : ""}${gain} dB`);
console.log(`${"mastered".padEnd(14)}${String(lm.lufs).padStart(8)}${String(lm.lra).padStart(7)}   EQ + 1.4:1 + limiter`);
if (ls.lufs !== null && ls.lufs < -19) {
  console.log(`\n  straight is ${Math.round(-14 - ls.lufs)} dB under the -14 platforms expect.`);
  console.log(`  Play both before picking. Set manifest.audio.pick to "straight" or "mastered".`);
}

m.audio = {
  ...audio,
  keepers: cut,
  straight: path.relative(m.__dir, straight),
  mastered: path.relative(m.__dir, mastered),
  duration: readSeconds,
  measured: { straight: ls, mastered: lm, gainDb: gain },
};
await saveManifest(m);
console.log(`\nmanifest updated (rev ${m.revision})`);
