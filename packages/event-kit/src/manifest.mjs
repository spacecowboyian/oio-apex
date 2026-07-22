// Per-event manifest: the fingerprinted record every later step selects from.
import path from "node:path";
import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";

export const MANIFEST_VERSION = 1;

/**
 * Asset lifecycle. `stub` is not a lifecycle state — it's "iCloud hasn't given
 * us the bytes yet", and exists so a re-run retries it instead of losing it.
 */
export const STATES = ["new", "selected", "rendered", "posted", "rejected", "stub"];

/** Only these get their media deleted by --cleanup. Never `new`. */
export const CLEANABLE = new Set(["posted", "rejected"]);

export const manifestPath = (eventDir) => path.join(eventDir, "manifest.json");

export async function loadManifest(eventDir, { slug = null } = {}) {
  try {
    const raw = await readFile(manifestPath(eventDir), "utf-8");
    const m = JSON.parse(raw);
    m.assets ??= {};
    return m;
  } catch {
    return {
      version: MANIFEST_VERSION,
      event: { slug: slug ?? path.basename(eventDir), createdAt: new Date().toISOString() },
      staging: [],
      assets: {},
    };
  }
}

export async function saveManifest(eventDir, manifest) {
  await mkdir(eventDir, { recursive: true });
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestPath(eventDir), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

/**
 * Insert or refresh an asset, keyed by fingerprint.
 *
 * Re-runnability rule: an asset that already exists keeps its state and its
 * human-made decisions. Ingest may fill in newly-derived fields (say a
 * transcript that failed last time) but must never knock `posted` back to
 * `new` — that would re-post published media.
 */
export function upsertAsset(manifest, asset) {
  const existing = manifest.assets[asset.fingerprint];
  if (!existing) {
    manifest.assets[asset.fingerprint] = {
      ...asset,
      state: asset.state ?? "new",
      addedAt: new Date().toISOString(),
    };
    return { created: true, asset: manifest.assets[asset.fingerprint] };
  }

  // A stub that finally materialized rejoins the normal lifecycle.
  const state = existing.state === "stub" && asset.state && asset.state !== "stub" ? asset.state : existing.state;

  manifest.assets[asset.fingerprint] = {
    ...existing,
    ...asset,
    state,
    addedAt: existing.addedAt,
    updatedAt: new Date().toISOString(),
  };
  return { created: false, asset: manifest.assets[asset.fingerprint] };
}

export function setState(manifest, fingerprint, state) {
  if (!STATES.includes(state)) throw new Error(`unknown state "${state}" (expected ${STATES.join("|")})`);
  const a = manifest.assets[fingerprint];
  if (!a) throw new Error(`no asset ${fingerprint}`);
  a.state = state;
  a.updatedAt = new Date().toISOString();
  return a;
}

export const assetsByState = (manifest, state) =>
  Object.values(manifest.assets).filter((a) => a.state === state);

export function summarize(manifest) {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const a of Object.values(manifest.assets)) counts[a.state] = (counts[a.state] ?? 0) + 1;
  return { total: Object.keys(manifest.assets).length, ...counts };
}

/**
 * Delete derived media for assets that are done with (`posted`/`rejected`).
 * Never touches the source files in staging, and never touches `new`.
 * The manifest rows stay — the record outlives the bytes.
 */
export async function cleanup(eventDir, manifest, { dryRun = false } = {}) {
  const removed = [];
  for (const a of Object.values(manifest.assets)) {
    if (!CLEANABLE.has(a.state)) continue;
    for (const key of ["normalizedPath", "sheetPath", "audioPath"]) {
      const p = a[key];
      if (!p) continue;
      if (await exists(p)) {
        if (!dryRun) await rm(p, { force: true });
        removed.push(p);
      }
      if (!dryRun) a[key] = null;
    }
    a.mediaCleanedAt = dryRun ? a.mediaCleanedAt : new Date().toISOString();
  }
  return removed;
}

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};
