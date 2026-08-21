// Backfill the `used` field in per-event footage-index.json from:
//   1. photo-log.md files (explicit source→post links, per-car in oio-brain-paperclip)
//   2. used-media-registry.json (Post Bridge burned cards by card name)
//
// The photo-log.md format has two shapes:
//   A) Markdown table: | Filename | … | Posted | Post Caption |
//   B) Section headers: ## filename.jpg followed by "Posted to social media: [ ]"
//
// The used-media-registry.json maps card_name → { media_id, post_id }.
// We can match by basename when the card_name preserves the source filename
// (many are UUID filenames — those cannot be backlinked without provenance tracking
// at post-creation time).
//
// NOTE: At post creation, the oio-social-post skill should call
//   event-kit mark-used --path <source-file> --media-id <id> --post-id <id>
// to keep this field current. sync-used is a one-time reconciliation pass.

import path from "node:path";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

/**
 * Parse a photo-log.md and return a map of filename → posting info.
 * Returns Map<string, { posted: boolean, caption: string|null }>.
 */
function parsePhotoLog(content) {
  const result = new Map();

  // Shape A: markdown table rows
  // | filename | date | event | subject | Yes/No | caption |
  const tableRe = /^\|\s*\[?([^\]|]+(?:\.[a-z]+)?)\]?(?:\([^)]+\))?\s*\|[^|]*\|[^|]*\|[^|]*\|\s*(Yes|No)\s*\|([^|]*)\|/gim;
  for (const m of content.matchAll(tableRe)) {
    const file = m[1].trim();
    const posted = m[2].trim().toLowerCase() === "yes";
    const caption = m[3].trim() || null;
    if (file && file !== "Filename") result.set(file, { posted, caption });
  }

  // Shape B: section headers (## filename) + checkbox lines
  const sectionRe = /^#{1,3}\s+(.+\.[a-zA-Z]{2,5})\s*$/gm;
  for (const m of content.matchAll(sectionRe)) {
    const file = m[1].trim();
    // Look at the next 300 chars for "Posted" checkboxes
    const after = content.slice(m.index + m[0].length, m.index + m[0].length + 300);
    const checked = /\[x\]\s*Instagram|\[x\]\s*Facebook|\[x\]\s*Posted/i.test(after);
    if (file) result.set(file, { posted: checked, caption: null });
  }

  return result;
}

/**
 * Walk a directory tree to collect all photo-log.md files.
 */
async function findPhotoLogs(dir) {
  const logs = [];
  if (!existsSync(dir)) return logs;
  const walk = async (d) => {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(d, e.name));
      else if (e.name === "photo-log.md") logs.push(path.join(d, e.name));
    }
  };
  await walk(dir);
  return logs;
}

/**
 * Load used-media-registry.json and return a Set of all card_names
 * that have been burned. Also returns a Map<card_name, entry>.
 */
async function loadUsedRegistry(registryPath) {
  if (!existsSync(registryPath)) return { cardNames: new Set(), byCardName: new Map() };
  const raw = JSON.parse(await readFile(registryPath, "utf8"));
  const byCardName = new Map();
  for (const b of (raw.burned ?? [])) {
    if (b.card_name) byCardName.set(b.card_name, b);
  }
  return { byCardName };
}

/**
 * Backfill `used` in all per-event footage-index.json files.
 *
 * @param {object} opts
 * @param {string}  opts.workingDir      - /Volumes/LaCie/working
 * @param {string}  [opts.photoLogsDir]  - oio-brain-paperclip/photos root
 * @param {string}  [opts.registryPath]  - used-media-registry.json
 * @param {boolean} [opts.dryRun]
 * @param {Function} [opts.log]
 * @returns {{ updated: number, events: string[] }}
 */
export async function syncUsed({
  workingDir,
  photoLogsDir = null,
  registryPath = null,
  dryRun = false,
  log = console.log,
} = {}) {
  // Build the filename→used map from photo-log.md files.
  const filePosted = new Map(); // basename → { source, posted, caption }
  if (photoLogsDir) {
    const logFiles = await findPhotoLogs(photoLogsDir);
    for (const logFile of logFiles) {
      const content = await readFile(logFile, "utf8");
      const parsed = parsePhotoLog(content);
      for (const [file, info] of parsed) {
        if (info.posted) {
          filePosted.set(file, { source: "photo-log", logFile, caption: info.caption });
        }
      }
    }
    log(`photo-logs: found ${logFiles.length} log file(s), ${filePosted.size} posted file(s)`);
  }

  // Build the card-name backlink map from used-media-registry.json.
  let byCardName = new Map();
  if (registryPath) {
    ({ byCardName } = await loadUsedRegistry(registryPath));
    log(`used-registry: ${byCardName.size} burned card name(s)`);
  }

  // Walk every event directory and update footage-index.json.
  const dirs = await readdir(workingDir, { withFileTypes: true });
  let totalUpdated = 0;
  const updatedEvents = [];

  for (const d of dirs) {
    if (!d.isDirectory() || d.name.startsWith("_") || d.name.startsWith(".")) continue;
    const indexPath = path.join(workingDir, d.name, "footage-index.json");
    if (!existsSync(indexPath)) continue;

    const raw = JSON.parse(await readFile(indexPath, "utf8"));
    if (!Array.isArray(raw)) continue;

    let changed = 0;
    for (const entry of raw) {
      if (entry.used) continue; // already marked

      const base = path.basename(entry.file ?? entry.path ?? "");

      // Match from photo-log.
      if (filePosted.has(base)) {
        const info = filePosted.get(base);
        entry.used = { source: "photo-log", logFile: info.logFile };
        changed++;
        continue;
      }

      // Match from used-registry by card_name == basename.
      if (byCardName.has(base)) {
        const reg = byCardName.get(base);
        entry.used = { mediaId: reg.media_id, postId: reg.post_id, source: "registry" };
        changed++;
      }
    }

    if (changed > 0) {
      if (!dryRun) {
        await writeFile(indexPath, JSON.stringify(raw, null, 2) + "\n");
      }
      log(`  ${d.name}: ${dryRun ? "[dry] " : ""}marked ${changed} entry/entries as used`);
      totalUpdated += changed;
      updatedEvents.push(d.name);
    }
  }

  return { updated: totalUpdated, events: updatedEvents };
}

/**
 * Mark a single source file as used. Called from oio-social-post at publish time
 * so the backlink is created immediately, not later during a sync pass.
 *
 * @param {string} sourcePath  - absolute path to the source file
 * @param {string} mediaId     - Post Bridge media ID
 * @param {string} postId      - Post Bridge post ID
 * @param {string} workingDir  - /Volumes/LaCie/working
 */
export async function markUsed({ sourcePath, mediaId, postId, workingDir }) {
  // Find the event dir containing this file.
  const rel = path.relative(workingDir, sourcePath);
  const eventName = rel.split(path.sep)[0];
  const indexPath = path.join(workingDir, eventName, "footage-index.json");
  if (!existsSync(indexPath)) throw new Error(`No footage-index at ${indexPath}`);

  const raw = JSON.parse(await readFile(indexPath, "utf8"));
  const entry = raw.find(e => e.path === sourcePath);
  if (!entry) throw new Error(`No entry for ${sourcePath} in ${indexPath}`);

  entry.used = { mediaId, postId, source: "post-bridge", markedAt: new Date().toISOString() };
  await writeFile(indexPath, JSON.stringify(raw, null, 2) + "\n");
  return entry;
}
