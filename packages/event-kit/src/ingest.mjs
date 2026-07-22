// Ingest: staging folder -> fingerprinted manifest + derived artifacts.
//
// Re-runnable by design. Ian keeps adding media to the staging folder until the
// event's posts are done, so ingest gets run repeatedly against a growing
// directory. Anything already processed is skipped; only genuinely new (or
// previously-incomplete) assets do work.
import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { fingerprint, kindFor } from "./util.mjs";
import { ensureLocal } from "./icloud.mjs";
import { probeStill, normalizeStill, probeClip } from "./probe.mjs";
import { contactSheet } from "./contact-sheet.mjs";
import { extractAudio, vadGate, transcribe } from "./transcribe.mjs";
import { loadManifest, saveManifest, upsertAsset, summarize } from "./manifest.mjs";

const dirs = (eventDir) => ({
  normalized: path.join(eventDir, "normalized"),
  sheets: path.join(eventDir, "sheets"),
  audio: path.join(eventDir, "audio"),
});

/** Recursively collect candidate media, skipping dotfiles and our own outputs. */
async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // includes .name.icloud placeholders
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["normalized", "sheets", "audio", "selects", "renders"].includes(e.name)) continue;
      await walk(full, out);
    } else if (kindFor(path.extname(e.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Does this already-known asset still need work? Lets a re-run repair a
 * partial ingest (a clip whose transcription timed out, an iCloud stub that
 * has since downloaded) without redoing finished assets.
 */
function needsWork(existing) {
  if (!existing) return true;
  if (existing.state === "stub") return true;
  if (existing.kind === "still") return !existing.normalizedPath;
  if (existing.kind === "clip") {
    if (!existing.sheetPath) return true;
    if (existing.clip?.hasAudio && !existing.audio) return true;
  }
  return false;
}

export async function ingest({
  stagingDirs,
  eventDir,
  slug = null,
  transcribeModel = "small",
  minSpeechSeconds = 0.4,
  skipAudio = false,
  log = console.log,
} = {}) {
  const d = dirs(eventDir);
  const manifest = await loadManifest(eventDir, { slug });
  for (const s of stagingDirs) if (!manifest.staging.includes(s)) manifest.staging.push(s);

  const files = [];
  for (const s of stagingDirs) await walk(s, files);
  log(`Found ${files.length} candidate file(s) across ${stagingDirs.length} staging dir(s).`);

  const stats = { processed: 0, skipped: 0, stubs: 0, failed: 0, transcribed: 0, gated: 0 };

  for (const file of files) {
    const name = path.basename(file);
    try {
      const local = await ensureLocal(file);
      if (!local.ok) {
        // Record it so a later run retries; never drop it on the floor.
        const fp = `stub:${path.relative(stagingDirs[0], file)}`;
        upsertAsset(manifest, {
          fingerprint: fp,
          kind: kindFor(path.extname(file).toLowerCase()),
          fileName: name,
          sourcePath: file,
          state: "stub",
          stubReason: local.reason,
        });
        stats.stubs++;
        log(`  stub  ${name} (${local.reason}) — will retry next run`);
        continue;
      }

      const fp = await fingerprint(file);
      const existing = manifest.assets[fp];
      if (!needsWork(existing)) {
        stats.skipped++;
        continue;
      }

      const { size } = await stat(file);
      const ext = path.extname(file).toLowerCase();
      const kind = kindFor(ext);
      const base = `${path.basename(file, ext)}-${fp.slice(0, 8)}`;
      const record = { fingerprint: fp, kind, fileName: name, sourcePath: file, bytes: size };

      if (kind === "still") {
        record.still = await probeStill(file);
        // Always normalize: loadImage ignores EXIF, so downstream needs upright pixels.
        record.normalizedPath = await normalizeStill(file, d.normalized);
        record.shotAt = record.still.shotAt ?? null;
        log(`  still ${name} -> ${record.still.width}x${record.still.height} (orient ${record.still.orientation})`);
      } else {
        const clip = await probeClip(file);
        record.clip = clip;
        const sheet = await contactSheet(file, clip.durationSeconds, d.sheets, base);
        record.sheetPath = sheet.sheetPath;
        record.sheet = {
          sampleFps: sheet.sampleFps,
          secondsPerCell: sheet.secondsPerCell,
          grid: sheet.grid,
          samples: sheet.samples,
        };
        log(
          `  clip  ${name} -> ${clip.width}x${clip.height} @${clip.fps}fps, ` +
            `${clip.durationSeconds}s play / ${clip.realTimeSeconds}s real${clip.highFps ? " (high-fps)" : ""}`,
        );

        if (!skipAudio && clip.hasAudio) {
          const wav = await extractAudio(file, d.audio, base);
          record.audioPath = wav;
          const vad = await vadGate(wav, { minSpeechSeconds });
          record.audio = { vad };
          if (vad.is_speech) {
            const t = await transcribe(wav, d.audio, { model: transcribeModel });
            record.audio.transcript = t.ok ? { text: t.text, words: t.words, segments: t.segments } : null;
            record.audio.transcribeError = t.ok ? null : t.error;
            if (t.ok && !t.empty) {
              stats.transcribed++;
              log(`        speech: "${t.text.slice(0, 70)}${t.text.length > 70 ? "…" : ""}"`);
            } else {
              log(`        speech gate passed but transcript empty/filtered — treated as no dialogue`);
            }
          } else {
            stats.gated++;
            log(`        no speech (mod ${vad.modulation ?? "?"}, ${vad.speech_seconds ?? 0}s) — skipped whisper`);
          }
        }
      }

      upsertAsset(manifest, record);
      stats.processed++;
    } catch (err) {
      stats.failed++;
      log(`  FAIL  ${name}: ${err.message}`);
    }
  }

  await saveManifest(eventDir, manifest);
  return { manifest, stats, summary: summarize(manifest) };
}
