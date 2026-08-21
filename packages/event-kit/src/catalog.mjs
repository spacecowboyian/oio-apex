// Footage catalog: build/update footage-index.json for an event folder.
//
// Covers both video clips and stills. Merges with an existing index rather
// than overwriting it, so manually-added descriptions and subject metadata
// are preserved across re-runs.
//
// Schema per entry:
//   kind          "source" | "still"
//   camera        inferred from directory / filename ("iphone", "drone", "x1", "x4", ...)
//   file          basename
//   path          absolute path
//   created       ISO timestamp (EXIF or mtime fallback)
//   duration      seconds (clips only, null for stills)
//   res           "WxH"
//   codec         video codec name (clips only)
//   dup           bool (null when unknown)
//   car           string | null
//   description   string | null  — plain English, filled by human or AI pass
//   subject_type  array of "action"|"face"|"detail"|"build"|"static" | null
//   people        array of person names | null
//   used          { mediaId, postId } if published via Post Bridge, else null

import path from "node:path";
import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { run, runOk } from "./util.mjs";

// Subdirectory names that contain derived artifacts, not source media.
const SKIP_DIRS = new Set([
  "normalized", "sheets", "audio", "selects", "renders",
  "branded", "overlays", "social-leaderboard", "social-people",
  "_thumbs", "_sheets", "_replace-report", "contact-sheets", "transcripts",
]);

// Extension → kind
const VIDEO_EXT = new Set([".mov", ".mp4", ".m4v", ".avi", ".insv"]);
const STILL_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".tiff", ".tif"]);

function mediaKind(ext) {
  const e = ext.toLowerCase();
  if (VIDEO_EXT.has(e)) return "video";
  if (STILL_EXT.has(e)) return "still";
  return null;
}

/** Infer camera label from path components. */
function inferCamera(filePath) {
  const parts = filePath.toLowerCase().split(path.sep);
  if (parts.some(p => p === "drone" || p.startsWith("dji"))) return "drone";
  if (parts.some(p => p === "x1" || p.includes("insta360-x1"))) return "x1";
  if (parts.some(p => p === "x4" || p.includes("insta360-x4"))) return "x4";
  if (parts.some(p => p === "iphone" || p === "iphone-orig" || p === "iphone_photos")) return "iphone";
  const base = path.basename(filePath).toLowerCase();
  if (base.startsWith("img_") || base.startsWith("img_e")) return "iphone";
  if (base.startsWith("dji_")) return "drone";
  if (base.startsWith("vid_2018") || base.endsWith(".insv")) return "x1";
  if (base.startsWith("vid_2026") && base.endsWith(".insv")) return "x4";
  return null;
}

/** ffprobe a video. Returns { res, codec, duration, created }. */
async function probeVideo(filePath) {
  try {
    const { out } = await runOk("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,codec_name,duration",
      "-show_entries", "format=duration,tags",
      "-of", "json",
      filePath,
    ]);
    const j = JSON.parse(out);
    const s = j.streams?.[0] ?? {};
    const dur = Number(s.duration) || Number(j.format?.duration) || null;
    const w = Number(s.width) || null;
    const h = Number(s.height) || null;
    const created = j.format?.tags?.creation_time ?? null;
    return {
      res: (w && h) ? `${w}x${h}` : null,
      codec: s.codec_name ?? null,
      duration: dur ? Math.round(dur * 1000) / 1000 : null,
      created: created ? created.replace("Z", ".000000Z") : null,
    };
  } catch {
    return { res: null, codec: null, duration: null, created: null };
  }
}

/** sips probe a still. Returns { res, created }. */
async function probeStill(filePath) {
  try {
    const r = await run("sips", [
      "-g", "pixelWidth", "-g", "pixelHeight", "-g", "creation", filePath,
    ]);
    const grab = (k) => r.out.match(new RegExp(`${k}:\\s*(.+)`))?.[1]?.trim() ?? null;
    const w = Number(grab("pixelWidth")) || null;
    const h = Number(grab("pixelHeight")) || null;
    const raw = grab("creation");
    let created = null;
    if (raw && raw !== "(unknown)") {
      // sips date: "2026:07:19 08:14:03 +0000" or ISO
      const m = raw.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
      if (m) {
        const [, y, mo, d, hh, mm, ss] = m;
        created = `${y}-${mo}-${d}T${hh}:${mm}:${ss}.000000Z`;
      }
    }
    return { res: (w && h) ? `${w}x${h}` : null, created };
  } catch {
    return { res: null, created: null };
  }
}

/** Fall back to filesystem mtime if we couldn't read EXIF creation. */
async function mtimeFallback(filePath) {
  try {
    const s = await stat(filePath);
    return s.mtime.toISOString().replace(/\.\d+Z$/, ".000000Z");
  } catch {
    return null;
  }
}

/** Recursively collect media files, skipping artifact directories and dotfiles. */
async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name.toLowerCase()) || e.name.startsWith("_")) continue;
      await walk(full, out);
    } else {
      const kind = mediaKind(path.extname(e.name));
      if (kind) out.push({ full, kind });
    }
  }
  return out;
}

/** Load existing footage-index.json, keyed by absolute path. */
async function loadExisting(eventDir) {
  const indexPath = path.join(eventDir, "footage-index.json");
  if (!existsSync(indexPath)) return new Map();
  try {
    const raw = await readFile(indexPath, "utf8");
    const arr = JSON.parse(raw);
    return new Map(arr.map(e => [e.path, e]));
  } catch {
    return new Map();
  }
}

/**
 * Build or update footage-index.json for eventDir.
 *
 * @param {object} opts
 * @param {string} opts.eventDir  - path to event folder
 * @param {Map}    [opts.usedMap] - map of absoluteFilePath → {mediaId, postId}
 * @param {Function} [opts.log]
 */
export async function catalog({
  eventDir,
  usedMap = new Map(),
  log = console.log,
} = {}) {
  const existing = await loadExisting(eventDir);
  const files = await walk(eventDir);
  log(`${path.basename(eventDir)}: found ${files.length} media file(s)`);

  const entries = [];
  let added = 0, updated = 0, skipped = 0;

  for (const { full, kind } of files) {
    const prev = existing.get(full);
    const usedInfo = usedMap.get(full) ?? null;

    if (prev && !usedInfo) {
      // Preserve existing entry but ensure new fields are present.
      const merged = {
        ...prev,
        subject_type: prev.subject_type ?? null,
        people: prev.people ?? null,
        used: prev.used ?? null,
      };
      entries.push(merged);
      skipped++;
      continue;
    }

    // Probe the file.
    let probed;
    if (kind === "video") {
      probed = await probeVideo(full);
    } else {
      probed = await probeStill(full);
    }

    const created = probed.created ?? await mtimeFallback(full);
    const camera = inferCamera(full);

    const entry = {
      kind: kind === "video" ? "source" : "still",
      camera,
      file: path.basename(full),
      path: full,
      created,
      ...(kind === "video" ? {
        duration: probed.duration,
        res: probed.res,
        codec: probed.codec,
        dup: prev?.dup ?? null,
      } : {
        res: probed.res,
      }),
      car: prev?.car ?? null,
      description: prev?.description ?? null,
      subject_type: prev?.subject_type ?? null,
      people: prev?.people ?? null,
      used: usedInfo ?? prev?.used ?? null,
    };

    if (prev) {
      updated++;
    } else {
      added++;
    }

    log(`  ${kind === "video" ? "clip " : "still"} ${entry.file}  ${entry.res ?? "?"}${kind === "video" ? ` ${entry.duration}s` : ""}`);
    entries.push(entry);
  }

  // Sort: stills first by created, then videos by created.
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "still" ? -1 : 1;
    return (a.created ?? "").localeCompare(b.created ?? "");
  });

  const indexPath = path.join(eventDir, "footage-index.json");
  await writeFile(indexPath, JSON.stringify(entries, null, 2) + "\n");

  return { added, updated, skipped, total: entries.length, indexPath };
}

/**
 * Build a master catalog index at the parent level listing all events and
 * their entry counts. Writes footage-catalog.json next to the event folders.
 */
export async function catalogAll({
  workingDir,
  usedMap = new Map(),
  log = console.log,
} = {}) {
  const entries = await readdir(workingDir, { withFileTypes: true });
  const eventDirs = entries
    .filter(e => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
    .map(e => path.join(workingDir, e.name));

  const summary = [];
  for (const eventDir of eventDirs) {
    const res = await catalog({ eventDir, usedMap, log });
    summary.push({
      event: path.basename(eventDir),
      path: eventDir,
      total: res.total,
      indexPath: res.indexPath,
    });
  }

  const masterPath = path.join(workingDir, "footage-catalog.json");
  await writeFile(masterPath, JSON.stringify({
    generated: new Date().toISOString(),
    events: summary,
    totalEntries: summary.reduce((n, e) => n + e.total, 0),
  }, null, 2) + "\n");

  return { summary, masterPath };
}
