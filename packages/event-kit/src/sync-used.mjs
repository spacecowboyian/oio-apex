// Backfill the `used` field in per-event footage-index.json from Post Bridge.
//
// Source of truth: used-media-registry.json on LaCie (written by agents after
// calling Post Bridge list_posts). Schema:
//   { burned: [{ media_id, card_name, post_id }] }
//
// Matching strategy (in priority order):
//   1. entry.used.mediaId already set → verify against burned set; update postId if missing
//   2. entry.file basename matches card_name in the registry (works when the oio-social-post
//      skill outputs a card named identically to its source file)
//
// NOTE: Most historical OIO Apex cards were named descriptively (e6-drone-mgb20.jpg, not
// DJI_0020.JPG), so basename matching will miss them. The canonical path forward is for
// oio-social-post to call `event-kit mark-used` at publish time, which records the
// source→post link immediately and reliably.
//
// oio-brain-paperclip has been deleted (2026-08-21). photo-log.md tracking is gone.
// Do not attempt to reconcile from it.

import path from "node:path";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

/**
 * Load used-media-registry.json and return lookup maps.
 *
 * Returns:
 *   byCardName  Map<card_name, { mediaId, postId }>
 *   byMediaId   Set<mediaId>  — all burned media IDs
 *   byMediaIdFull Map<mediaId, { cardName, postId }>
 */
async function loadBurnedRegistry(registryPath) {
  if (!existsSync(registryPath)) {
    return { byCardName: new Map(), byMediaId: new Set(), byMediaIdFull: new Map() };
  }
  const raw = JSON.parse(await readFile(registryPath, "utf8"));
  const byCardName = new Map();
  const byMediaId = new Set();
  const byMediaIdFull = new Map();
  for (const b of (raw.burned ?? [])) {
    const mediaId = b.media_id ?? b.mediaId;
    const cardName = b.card_name ?? b.cardName ?? null;
    const postId = b.post_id ?? b.postId;
    if (mediaId) {
      byMediaId.add(mediaId);
      byMediaIdFull.set(mediaId, { cardName, postId });
    }
    if (cardName && cardName !== "uc" && !cardName.match(/^[0-9a-f-]{36}\./) ) {
      byCardName.set(cardName, { mediaId, postId });
    }
  }
  return { byCardName, byMediaId, byMediaIdFull };
}

/**
 * Backfill `used` in all per-event footage-index.json files from Post Bridge data.
 *
 * @param {object} opts
 * @param {string}  opts.workingDir    - /Volumes/LaCie/working
 * @param {string}  [opts.registryPath] - path to used-media-registry.json
 *                                        (defaults to workingDir/used-media-registry.json)
 * @param {boolean} [opts.dryRun]
 * @param {Function} [opts.log]
 * @returns {{ updated: number, events: string[] }}
 */
export async function syncUsed({
  workingDir,
  registryPath = null,
  dryRun = false,
  log = console.log,
} = {}) {
  const regPath = registryPath ?? path.join(workingDir, "used-media-registry.json");
  const { byCardName, byMediaId, byMediaIdFull } = await loadBurnedRegistry(regPath);
  log(`burned-registry: ${byMediaId.size} media IDs, ${byCardName.size} named card(s)`);

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
      // Path 1: entry already has mediaId recorded — verify/update against burned set.
      if (entry.used?.mediaId) {
        if (byMediaId.has(entry.used.mediaId) && !entry.used.postId) {
          const reg = byMediaIdFull.get(entry.used.mediaId);
          entry.used = {
            mediaId: entry.used.mediaId,
            postId: reg.postId,
            cardName: reg.cardName ?? entry.used.cardName ?? null,
            source: "post-bridge",
          };
          changed++;
        }
        continue; // already linked
      }

      // Path 2: match by card name (works when card output filename = source basename).
      const base = path.basename(entry.file ?? entry.path ?? "");
      if (byCardName.has(base)) {
        const reg = byCardName.get(base);
        entry.used = { mediaId: reg.mediaId, postId: reg.postId, source: "post-bridge" };
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
  const rel = path.relative(workingDir, sourcePath);
  const eventName = rel.split(path.sep)[0];
  const indexPath = path.join(workingDir, eventName, "footage-index.json");
  if (!existsSync(indexPath)) throw new Error(`No footage-index at ${indexPath}`);

  const raw = JSON.parse(await readFile(indexPath, "utf8"));
  const entry = raw.find(e => e.path === sourcePath || e.file === path.basename(sourcePath));
  if (!entry) throw new Error(`No entry for ${sourcePath} in ${indexPath}`);

  entry.used = { mediaId, postId, source: "post-bridge", markedAt: new Date().toISOString() };
  await writeFile(indexPath, JSON.stringify(raw, null, 2) + "\n");
  return entry;
}
