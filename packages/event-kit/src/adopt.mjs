// Adopt media dropped into a Claude Code chat straight into the staging folder.
//
// In a Claude Code session running on Ian's Mac, files attached to the chat are
// written to ~/.claude/uploads/<session-id>/<hash>-<originalname>. They are real
// files on the real disk, so they can be copied into staging without any cloud
// hop at all. (This is Mac-only by nature — the phone app has no local
// filesystem, so phone media still needs the iCloud folder as transport.)
//
// Copy, never move: the uploads dir is Claude's, not ours, and a failed ingest
// shouldn't destroy the only copy.
import path from "node:path";
import os from "node:os";
import { readdir, stat, copyFile, mkdir } from "node:fs/promises";
import { kindFor, fingerprint } from "./util.mjs";

export const UPLOADS_ROOT = path.join(os.homedir(), ".claude", "uploads");

/** Session folders, newest first. */
export async function listSessions(root = UPLOADS_ROOT) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const full = path.join(root, e.name);
    dirs.push({ id: e.name, path: full, mtime: (await stat(full)).mtimeMs });
  }
  return dirs.sort((a, b) => b.mtime - a.mtime);
}

/** `4b883258-IMG_0047.mov` -> `IMG_0047.mov`. Leaves already-clean names alone. */
export const stripUploadPrefix = (name) => name.replace(/^[0-9a-f]{6,}-/i, "") || name;

/**
 * Copy chat-dropped media into staging. Dedupes by content fingerprint against
 * what's already in staging, so re-running after dropping more files is safe
 * and won't pile up duplicates under slightly different names.
 */
export async function adopt({ stagingDir, sessionPaths, log = console.log } = {}) {
  await mkdir(stagingDir, { recursive: true });

  // Fingerprint what's already staged so we don't re-copy.
  const existing = new Set();
  for (const f of await readdir(stagingDir).catch(() => [])) {
    if (!kindFor(path.extname(f).toLowerCase())) continue;
    try {
      existing.add(await fingerprint(path.join(stagingDir, f)));
    } catch {}
  }

  const copied = [];
  let skipped = 0;
  for (const sp of sessionPaths) {
    for (const f of await readdir(sp).catch(() => [])) {
      if (f.startsWith(".")) continue;
      const src = path.join(sp, f);
      const ext = path.extname(f).toLowerCase();
      if (!kindFor(ext)) continue;
      if (!(await stat(src)).isFile()) continue;

      const fp = await fingerprint(src);
      if (existing.has(fp)) {
        skipped++;
        continue;
      }

      let destName = stripUploadPrefix(f);
      let dest = path.join(stagingDir, destName);
      // Different content that happens to share a name keeps its hash prefix.
      if (await exists(dest)) dest = path.join(stagingDir, f);

      await copyFile(src, dest);
      existing.add(fp);
      copied.push(path.basename(dest));
      log(`  adopted ${path.basename(dest)}`);
    }
  }
  return { copied, skipped };
}

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};
