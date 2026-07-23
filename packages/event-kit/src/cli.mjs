#!/usr/bin/env node
/**
 * event-kit CLI.
 *
 *   ingest  --event <dir> --staging <dir> [--staging <dir>...] [options]
 *   status  --event <dir>
 *   state   --event <dir> --asset <fingerprint> --set <state>
 *   cleanup --event <dir> [--dry-run]
 *
 * Ingest is re-runnable: run it again after dropping more media into staging.
 */
import path from "node:path";
import { ingest } from "./ingest.mjs";
import { adopt, listSessions } from "./adopt.mjs";
import { pullAlbum, listAlbums, createAlbum } from "./photos.mjs";
import { loadManifest, saveManifest, setState, summarize, cleanup, STATES } from "./manifest.mjs";

function parseArgs(argv) {
  const out = { _: [], staging: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    if (key === "staging") out.staging.push(path.resolve(next));
    else out[key] = next;
    i++;
  }
  return out;
}

const need = (v, msg) => {
  if (!v) {
    console.error(msg);
    process.exit(1);
  }
  return v;
};

const cmds = {
  /** List Photos albums, or create one: `albums --create "OIO Event Drop"`. */
  async albums(args) {
    if (args.create && args.create !== true) {
      await createAlbum(args.create);
      console.log(`created album "${args.create}" (it will sync to your phone via iCloud Photos)`);
    }
    const names = await listAlbums();
    console.log(names.length ? names.map((n) => `  ${n}`).join("\n") : "  (no albums)");
  },

  /**
   * Pull new items from a Photos album into staging. Incremental: the ids
   * already pulled are remembered in the event manifest, so re-running after
   * adding three photos moves three files, not the whole album.
   */
  async "pull-album"(args) {
    const eventDir = path.resolve(need(args.event, "Missing --event <dir>"));
    const albumName = need(args.album, 'Missing --album "<name>"');
    const stagingDir = path.resolve(args.staging[0] ?? path.join(eventDir, "staging"));
    const m = await loadManifest(eventDir, { slug: args.slug ?? null });
    m.photos ??= { album: albumName, seenIds: [] };

    const res = await pullAlbum({ albumName, stagingDir, seenIds: m.photos.seenIds });
    m.photos = { album: albumName, seenIds: res.seenIds };
    await saveManifest(eventDir, m);

    const live = res.livePhotos ? `, live-photo components skipped ${res.livePhotos}` : "";
    console.log(`pulled ${res.copied.length}, already-staged ${res.skipped}${live}`);
    console.log(`staging: ${stagingDir}`);
    console.log("(run `ingest` next)");
  },

  /**
   * Pull media you dropped into this Claude Code chat into the staging folder.
   * Defaults to the most recent chat session; --all sweeps every session.
   */
  async adopt(args) {
    const stagingDir = path.resolve(need(args.staging[0] ?? args.to, "Missing --staging <dir>"));
    const sessions = await listSessions();
    if (!sessions.length) {
      console.error("No Claude upload sessions found (~/.claude/uploads).");
      process.exit(1);
    }
    const picked = args.all
      ? sessions
      : args.session
        ? sessions.filter((s) => s.id === args.session)
        : [sessions[0]];
    if (!picked.length) {
      console.error(`No session matching --session ${args.session}`);
      process.exit(1);
    }
    console.log(`Adopting from ${picked.length} session(s) -> ${stagingDir}`);
    const res = await adopt({ stagingDir, sessionPaths: picked.map((s) => s.path) });
    console.log(`adopted ${res.copied.length}, already-staged ${res.skipped}`);
    console.log("(originals are copied, not moved — run `ingest` next)");
  },

  async ingest(args) {
    const eventDir = path.resolve(need(args.event, "Missing --event <dir>"));
    need(args.staging.length, "Missing --staging <dir> (repeatable)");
    const res = await ingest({
      stagingDirs: args.staging,
      eventDir,
      slug: args.slug ?? null,
      transcribeModel: args.model ?? "small",
      minSpeechSeconds: Number(args["min-speech"] ?? 0.4),
      skipAudio: Boolean(args["skip-audio"]),
    });
    console.log("\n--- ingest ---");
    console.log(
      `processed ${res.stats.processed}, skipped ${res.stats.skipped}, stubs ${res.stats.stubs}, failed ${res.stats.failed}`,
    );
    console.log(`transcribed ${res.stats.transcribed}, gated-out ${res.stats.gated}`);
    console.log("manifest:", summarizeLine(res.summary));
  },

  async status(args) {
    const eventDir = path.resolve(need(args.event, "Missing --event <dir>"));
    const m = await loadManifest(eventDir);
    console.log(`event: ${m.event?.slug ?? "?"}  (${eventDir})`);
    console.log(summarizeLine(summarize(m)));
    for (const a of Object.values(m.assets)) {
      const extra =
        a.kind === "clip"
          ? `${a.clip?.durationSeconds ?? "?"}s${a.audio?.transcript?.text ? " [speech]" : ""}`
          : `${a.still?.width ?? "?"}x${a.still?.height ?? "?"}`;
      console.log(`  ${a.state.padEnd(9)} ${a.kind.padEnd(5)} ${a.fileName}  ${extra}`);
    }
  },

  async state(args) {
    const eventDir = path.resolve(need(args.event, "Missing --event <dir>"));
    need(args.asset, "Missing --asset <fingerprint>");
    need(args.set, `Missing --set <${STATES.join("|")}>`);
    const m = await loadManifest(eventDir);
    const a = setState(m, args.asset, args.set);
    await saveManifest(eventDir, m);
    console.log(`${a.fileName} -> ${a.state}`);
  },

  async cleanup(args) {
    const eventDir = path.resolve(need(args.event, "Missing --event <dir>"));
    const dryRun = Boolean(args["dry-run"]);
    const m = await loadManifest(eventDir);
    const removed = await cleanup(eventDir, m, { dryRun });
    if (!dryRun) await saveManifest(eventDir, m);
    console.log(`${dryRun ? "[dry-run] would remove" : "removed"} ${removed.length} derived file(s)`);
    for (const r of removed) console.log(`  ${r}`);
    console.log("(source media in staging is never touched; `new` assets are never cleaned)");
  },
};

const summarizeLine = (s) =>
  `total ${s.total} — new ${s.new}, selected ${s.selected}, rendered ${s.rendered}, posted ${s.posted}, rejected ${s.rejected}, stub ${s.stub}`;

const [cmd, ...rest] = process.argv.slice(2);
const handler = cmds[cmd];
if (!handler) {
  console.error(`Usage: event-kit <${Object.keys(cmds).join("|")}> [options]`);
  process.exit(1);
}
handler(parseArgs(rest)).catch((e) => {
  console.error(e.stack || String(e));
  process.exit(1);
});
