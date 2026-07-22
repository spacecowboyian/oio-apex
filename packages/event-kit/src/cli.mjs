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
