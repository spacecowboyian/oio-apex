// Pull media out of an Apple Photos album into staging, via AppleScript.
//
// WHY: adding to an album from the phone is two taps (select -> Add to Album)
// and needs no Files-app folder wrangling. iCloud Photos syncs the album to the
// Mac, where Photos.app is scriptable. There is no Google Photos connector and
// no iCloud *Photos* connector — but the local Photos library is right there,
// so AppleScript is the bridge.
//
// Exports ORIGINALS (`with using originals`), so 4K/120fps video arrives at
// full quality rather than a re-encoded preview.
//
// First run triggers a one-time macOS automation permission prompt.
import path from "node:path";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { run } from "./util.mjs";
import { kindFor, fingerprint } from "./util.mjs";

const osa = (script, timeoutMs = 15 * 60_000) => run("osascript", ["-e", script], { timeoutMs });

/** AppleScript string literal escaping. */
const q = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export async function listAlbums() {
  const r = await osa(`tell application "Photos" to get name of albums`);
  if (r.code !== 0) throw new Error(`Photos not scriptable: ${r.err.slice(-300)}`);
  return r.out.trim() ? r.out.trim().split(", ").map((s) => s.trim()) : [];
}

export async function createAlbum(name) {
  const r = await osa(`tell application "Photos" to make new album named ${q(name)}`);
  if (r.code !== 0) throw new Error(`could not create album: ${r.err.slice(-300)}`);
  return name;
}

/** [{id, filename}] for an album, cheap enough to run every pull. */
export async function albumItems(albumName) {
  const script = `
tell application "Photos"
  set out to ""
  set theAlbum to album ${q(albumName)}
  repeat with mi in (media items of theAlbum)
    set out to out & (id of mi) & "\t" & (filename of mi) & linefeed
  end repeat
  return out
end tell`;
  const r = await osa(script);
  if (r.code !== 0) throw new Error(`could not read album "${albumName}": ${r.err.slice(-300)}`);
  return r.out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [id, ...rest] = l.split("\t");
      return { id, filename: rest.join("\t") };
    });
}

/**
 * Export the given media-item ids from an album into destDir.
 *
 * Only the NEW ids are exported (the caller diffs against what it already
 * has), so a re-pull after adding three photos to a 200-item album moves three
 * files, not two hundred.
 */
async function exportIds(albumName, ids, destDir) {
  if (!ids.length) return;
  await mkdir(destDir, { recursive: true });
  const idList = ids.map((i) => q(i)).join(", ");
  const script = `
set wantedIds to {${idList}}
tell application "Photos"
  set theAlbum to album ${q(albumName)}
  set toExport to {}
  repeat with mi in (media items of theAlbum)
    if (id of mi) is in wantedIds then set end of toExport to mi
  end repeat
  if (count of toExport) > 0 then
    export toExport to POSIX file ${q(destDir)} with using originals
  end if
  return (count of toExport) as text
end tell`;
  const r = await osa(script);
  if (r.code !== 0) throw new Error(`export failed: ${r.err.slice(-400)}`);
}

/**
 * Pull an album into staging.
 *
 * `seenIds` is the set of Photos media-item ids already pulled (persisted by the
 * caller). Exports to a temp dir first, then moves only genuinely-new content
 * into staging — deduped by content fingerprint, so the same photo added to the
 * album twice, or already dropped in via chat, doesn't land twice.
 */
export async function pullAlbum({ albumName, stagingDir, seenIds = [], log = console.log } = {}) {
  await mkdir(stagingDir, { recursive: true });
  const items = await albumItems(albumName);
  const seen = new Set(seenIds);
  const fresh = items.filter((i) => !seen.has(i.id));
  log(`album "${albumName}": ${items.length} item(s), ${fresh.length} new`);
  if (!fresh.length) return { copied: [], skipped: 0, seenIds: items.map((i) => i.id) };

  const tmp = path.join(stagingDir, ".photos-export-tmp");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });

  try {
    await exportIds(albumName, fresh.map((i) => i.id), tmp);

    // Fingerprint what's already staged so a re-pull can't duplicate.
    const existing = new Set();
    for (const f of await readdir(stagingDir).catch(() => [])) {
      if (!kindFor(path.extname(f).toLowerCase())) continue;
      try {
        existing.add(await fingerprint(path.join(stagingDir, f)));
      } catch {}
    }

    const exported = (await readdir(tmp).catch(() => [])).filter((f) =>
      kindFor(path.extname(f).toLowerCase()),
    );

    // Live Photos export as a PAIR: IMG_0038.HEIC + IMG_0038.mov. That .mov is
    // a ~3s silent motion component, not footage — staged as-is it would get a
    // contact sheet, a VAD pass and a slot in the clip pool as if it were a
    // real clip. Drop the motion half; the still is the actual asset.
    const stillBases = new Set(
      exported
        .filter((f) => kindFor(path.extname(f).toLowerCase()) === "still")
        .map((f) => path.basename(f, path.extname(f)).toLowerCase()),
    );

    const copied = [];
    let skipped = 0;
    let livePhotos = 0;
    for (const f of exported) {
      const src = path.join(tmp, f);
      if (!(await stat(src)).isFile()) continue;

      const ext = path.extname(f).toLowerCase();
      if (kindFor(ext) === "clip" && stillBases.has(path.basename(f, ext).toLowerCase())) {
        livePhotos++;
        log(`  skipped ${f} (Live Photo motion component)`);
        continue;
      }

      const fp = await fingerprint(src);
      if (existing.has(fp)) {
        skipped++;
        continue;
      }
      let dest = path.join(stagingDir, f);
      if (await pathExists(dest)) dest = path.join(stagingDir, `${fp.slice(0, 8)}-${f}`);
      await rename(src, dest);
      existing.add(fp);
      copied.push(path.basename(dest));
      log(`  pulled ${path.basename(dest)}`);
    }
    // Record every id we've now seen, including ones that deduped away, so we
    // don't re-export them next time.
    return { copied, skipped, livePhotos, seenIds: items.map((i) => i.id) };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

const pathExists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};
