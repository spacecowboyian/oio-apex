// Audio pass: strip audio -> VAD gate -> whisper (word timestamps) -> sanity filter.
import path from "node:path";
import { mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { run, runOk } from "./util.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAD_PY = path.join(HERE, "vad.py");

/** 16k mono wav — what both the VAD and whisper want. */
export async function extractAudio(clipPath, outDir, name) {
  await mkdir(outDir, { recursive: true });
  const wav = path.join(outDir, `${name}.wav`);
  await runOk("ffmpeg", ["-y", "-i", clipPath, "-vn", "-ac", "1", "-ar", "16000", wav]);
  return wav;
}

/** Heuristic speech gate. See vad.py for why this exists and what it keys on. */
export async function vadGate(wavPath, { minSpeechSeconds = 0.4 } = {}) {
  const r = await run("python3", [VAD_PY, wavPath, "--min-speech", String(minSpeechSeconds)]);
  if (r.code !== 0) {
    // Fail OPEN with a flag rather than silently dropping possible dialogue.
    return { is_speech: false, reason: `vad failed: ${r.err.slice(-200)}`, vadError: true };
  }
  try {
    return JSON.parse(r.out.trim());
  } catch {
    return { is_speech: false, reason: "vad parse error", vadError: true };
  }
}

/**
 * Phrases whisper emits from silence/noise. Not an exhaustive list — it's the
 * long tail of "polite YouTube outro" text the model falls back on when it has
 * nothing to transcribe.
 */
const HALLUCINATION = [
  /thanks? for watching/i,
  /please (like|subscribe)/i,
  /subscribe to (my|the) channel/i,
  /^\s*(you|bye+|thank you|thanks)[\s.!]*$/i,
  /^\s*bye[\s-]*bye[\s.!]*$/i,
  /that'?s all for now/i,
  /see you (in|on) the next (one|video)/i,
  /amara\.org/i,
  /transcription by/i,
  /^\s*\[?\s*(music|applause|silence|blank_audio)\s*\]?\s*$/i,
];

const looksHallucinated = (text) => HALLUCINATION.some((re) => re.test(text.trim()));

/**
 * Transcribe with WORD-level timestamps. Segment-level is too coarse to time a
 * one-line caption card against — cards drift off the speech.
 */
export async function transcribe(wavPath, outDir, { model = "small", language = "en" } = {}) {
  await mkdir(outDir, { recursive: true });
  const r = await run("whisper", [
    wavPath,
    "--model", model,
    "--language", language,
    "--word_timestamps", "True",
    "--output_format", "json",
    "--output_dir", outDir,
    "--fp16", "False",
  ], { timeoutMs: 15 * 60_000 });

  if (r.code !== 0) return { ok: false, error: `whisper exited ${r.code}: ${r.err.slice(-300)}` };

  const jsonPath = path.join(outDir, `${path.basename(wavPath, ".wav")}.json`);
  let raw;
  try {
    raw = JSON.parse(await readFile(jsonPath, "utf-8"));
  } catch (e) {
    return { ok: false, error: `no whisper json: ${e.message}` };
  }

  // Second gate: drop segments whisper itself doubts, or that match the
  // known no-speech filler. Belt and braces with the VAD.
  const segments = (raw.segments ?? []).filter(
    (s) => (s.no_speech_prob ?? 0) < 0.6 && !looksHallucinated(s.text ?? ""),
  );

  const words = segments.flatMap((s) =>
    (s.words ?? []).map((w) => ({
      word: (w.word ?? "").trim(),
      start: round(w.start),
      end: round(w.end),
      prob: round(w.probability),
    })),
  );

  const text = segments.map((s) => (s.text ?? "").trim()).join(" ").trim();
  await rm(jsonPath, { force: true });

  return {
    ok: true,
    text,
    words,
    segments: segments.map((s) => ({ start: round(s.start), end: round(s.end), text: (s.text ?? "").trim() })),
    droppedSegments: (raw.segments ?? []).length - segments.length,
    empty: text.length === 0,
  };
}

const round = (n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null);
