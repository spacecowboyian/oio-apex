// iCloud Drive placeholder handling.
//
// With "Optimize Mac Storage" on, iCloud evicts file contents and leaves a
// dataless placeholder. Two shapes show up in practice:
//   1. a sibling `.<name>.icloud` plist and NO real file, or
//   2. the real filename present but zero-byte / not yet materialized.
// Ingest must not crash on either — it asks iCloud to download, waits a
// bounded time, and reports back rather than throwing.
import { stat, access } from "node:fs/promises";
import path from "node:path";
import { run } from "./util.mjs";

/** The `.name.icloud` placeholder path macOS uses for an evicted file. */
export const placeholderPathFor = (filePath) =>
  path.join(path.dirname(filePath), `.${path.basename(filePath)}.icloud`);

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

/** Is this path a real, materialized, non-empty file right now? */
export async function isMaterialized(filePath) {
  try {
    const s = await stat(filePath);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

/**
 * Ensure a file's bytes are actually local. Returns:
 *   {ok:true}                      already there, or downloaded in time
 *   {ok:false, reason:"stub"}      still a placeholder after waiting
 *   {ok:false, reason:"missing"}   no file and no placeholder
 *
 * Bounded wait on purpose: a 4GB clip over a slow link should not hang ingest.
 * The asset is recorded as `stub` and picked up on the next re-run instead.
 */
export async function ensureLocal(filePath, { timeoutMs = 120_000, pollMs = 1500 } = {}) {
  if (await isMaterialized(filePath)) return { ok: true };

  const placeholder = placeholderPathFor(filePath);
  const hasPlaceholder = await exists(placeholder);
  if (!hasPlaceholder && !(await exists(filePath))) return { ok: false, reason: "missing" };

  // brctl is macOS-only and best-effort; a non-zero exit just means we wait and re-check.
  await run("brctl", ["download", filePath], { timeoutMs: 15_000 });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isMaterialized(filePath)) return { ok: true };
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { ok: false, reason: "stub" };
}
