// Search across all per-event footage-index.json files.
//
// This is the query layer that reconciles the four stores:
//   1. footage-index.json on LaCie (the primary per-event catalog)
//   2. used-media-registry.json (Post Bridge publish history)
//   3. photo-log.md files (explicit source→post backlinks, per car)
//   4. Brains event data (read externally; not loaded here)
//
// The `used` field on each entry is the join point between the catalog
// and the publish stores. sync-used.mjs populates it.

import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const SKIP_DIRS = new Set(["_assets", "_x1-duplicates", "_quarantine"]);

/**
 * Load all entries from all events' footage-index.json under workingDir.
 * Injects an `event` field (the folder name) so callers know provenance.
 */
export async function loadAll(workingDir) {
  const entries = await readdir(workingDir, { withFileTypes: true });
  const all = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const indexPath = path.join(workingDir, e.name, "footage-index.json");
    if (!existsSync(indexPath)) continue;
    try {
      const raw = await readFile(indexPath, "utf8");
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        all.push({ event: e.name, ...item });
      }
    } catch {
      // skip malformed index
    }
  }
  return all;
}

/**
 * Filter an array of entries by query options.
 *
 * opts:
 *   event      string   — exact or partial match on event folder name
 *   subject    string   — one of "action", "face", "detail", "build", "static"
 *   unused     boolean  — only entries where used is null/falsy
 *   kind       string   — "still" or "source" (video)
 *   camera     string   — "x1", "x4", "iphone", "drone"
 *   car        string   — substring match on entry.car
 *   described  boolean  — only entries with a description
 *   people     string   — substring match on any name in entry.people
 */
export function filter(entries, opts = {}) {
  let res = entries;

  if (opts.event) {
    const q = opts.event.toLowerCase();
    res = res.filter(e => e.event.toLowerCase().includes(q));
  }
  if (opts.subject) {
    const want = Array.isArray(opts.subject) ? opts.subject : [opts.subject];
    res = res.filter(e => {
      if (!e.subject_type) return false;
      const have = Array.isArray(e.subject_type) ? e.subject_type : [e.subject_type];
      return want.some(s => have.includes(s));
    });
  }
  if (opts.unused) {
    res = res.filter(e => !e.used);
  }
  if (opts.kind) {
    res = res.filter(e => e.kind === opts.kind);
  }
  if (opts.camera) {
    res = res.filter(e => e.camera === opts.camera);
  }
  if (opts.car) {
    const q = opts.car.toLowerCase();
    res = res.filter(e => e.car && e.car.toLowerCase().includes(q));
  }
  if (opts.described) {
    res = res.filter(e => e.description);
  }
  if (opts.people) {
    const q = opts.people.toLowerCase();
    res = res.filter(e => {
      if (!e.people) return false;
      const list = Array.isArray(e.people) ? e.people : [e.people];
      return list.some(p => p.toLowerCase().includes(q));
    });
  }

  return res;
}

/**
 * Format entries as a human-readable table for terminal output.
 */
export function formatTable(entries, limit = 50) {
  const rows = entries.slice(0, limit);
  if (!rows.length) return "(no results)";

  const lines = [
    `Found ${entries.length} match(es)${entries.length > limit ? ` (showing first ${limit})` : ""}`,
    "",
  ];

  for (const e of rows) {
    const used = e.used ? `✓ used (${e.used.postId ?? e.used.source ?? "?"})` : "unused";
    const subject = e.subject_type
      ? (Array.isArray(e.subject_type) ? e.subject_type : [e.subject_type]).join(",")
      : "—";
    const desc = e.description ? `  "${e.description.slice(0, 80)}"` : "";
    lines.push(
      `${e.event}/${e.file}  [${e.kind}] [${e.camera ?? "?"}] [${subject}] [${used}]${desc}`,
    );
    lines.push(`  path: ${e.path}`);
  }

  return lines.join("\n");
}
