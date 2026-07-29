#!/usr/bin/env node
/**
 * Stage 6b of the narrated recap: cut the footage to the cards and composite.
 *
 * Card LENGTHS come from the voiceover, never from the layout's own
 * cardSeconds. What the layout supplies is order, crop, speed, and a CENTRE
 * time per clip, and the centre is what gets honoured: the source window is
 * grown or shrunk around it to fill whatever length the card turned out to be.
 * That is the reason retiming is cheap. If the layout stored in/out points
 * instead, every card length change would drift the clip off the action and
 * Ian would have to re-pick all of them.
 *
 * Two outputs, because Ian recuts in Resolve:
 *   clips-only.mp4   the footage track alone, board area black
 *   complete.mp4     the same with the leaderboard composited on top
 *
 * Delivery is encoded ONCE at social-delivery quality rather than mastering
 * first and transcoding down. A CRF 18 master of this length lands near 100 MB
 * and Post-Bridge fails it on Facebook with a bare "Failed to process video";
 * the same cut at ~40 MB publishes first try. See Brains
 * `canonical/postbridge-video-publishing.md`.
 *
 * Usage: node scripts/recap-render.mjs <manifest.json>
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  ffmpeg, loadManifest, saveManifest, resolve, duration, round,
  writeConcatList, usage,
} from "./recap-core.mjs";

const [manifestPath] = process.argv.slice(2);
if (!manifestPath) usage("Usage: node scripts/recap-render.mjs <manifest.json>");

const m = await loadManifest(manifestPath);
if (!m.cards?.length) usage("manifest.cards is required");
if (!m.layout) usage("manifest.layout is required (layout.json from the clip layout tool)");
if (!m.board?.retimed) usage("manifest.board.retimed is required (run recap-board.mjs first)");

const fps = m.fps ?? 30;
const frame = m.frame ?? { w: 1080, h: 1920 };
const box = m.box ?? { w: 1080, h: 900, y: 1020 };
const fade = m.fadeSeconds ?? 0.6;
const entryClips = m.entryCardClips ?? 3;
const delivery = m.delivery ?? { crf: 24, maxrate: "6M", bufsize: "12M", preset: "medium" };

const pool = resolve(m, m.pool);
const work = resolve(m, m.work ?? ".");
const layout = JSON.parse(await fs.readFile(resolve(m, m.layout), "utf-8"));
const clips = layout.clips.filter((c) => c.enabled !== false).sort((a, b) => a.order - b.order);

// --- schedule: which clip covers which stretch of time ---------------------
// The entry card holds several clips (they introduce the cars), split evenly
// across it. Every run card takes one. The last card takes the last clip.
const bounds = [...m.cards.map((c) => c.start), m.cards[m.cards.length - 1].end];
const runCards = m.cards.length - 2; // everything between entry and final
const segments = [];

const sub = (bounds[1] - bounds[0]) / entryClips;
for (let i = 0; i < entryClips; i++) {
  segments.push({
    start: bounds[0] + i * sub,
    end: bounds[0] + (i + 1) * sub,
    clip: clips[i],
    label: (m.labels ?? {})[String(i)],
  });
}
for (let c = 1; c <= runCards; c++) {
  segments.push({ start: bounds[c], end: bounds[c + 1], clip: clips[entryClips + c - 1] });
}
segments.push({ start: bounds[m.cards.length - 1], end: bounds[m.cards.length], clip: clips[clips.length - 1] });

const missing = segments.filter((s) => !s.clip);
if (missing.length) {
  usage(`layout has ${clips.length} enabled clips but the schedule needs ${segments.length}`);
}
const used = new Set(segments.map((s) => s.clip));
const unused = clips.filter((c) => !used.has(c));
console.log(`${clips.length} clips enabled, ${segments.length} slots`);
if (unused.length) console.log(`  not used: ${unused.map((c) => `${c.file} @ ${c.center}`).join(", ")}`);

// --- cut each clip to its card --------------------------------------------
const segDir = path.join(work, "footage-segments");
await fs.rm(segDir, { recursive: true, force: true });
await fs.mkdir(segDir, { recursive: true });

const files = [];
for (const [i, s] of segments.entries()) {
  const c = s.clip;
  const dur = round(s.end - s.start, 4);
  const speed = c.speed ?? 1;
  const need = dur * speed;                       // source seconds this slot eats
  const available = c.source?.duration ?? Infinity;
  if (need > available) {
    usage(`${c.file} is ${available}s but slot ${i + 1} needs ${round(need)}s of source`);
  }
  // honour the chosen centre, clamped so the window stays inside the clip
  const inPoint = Math.max(0, Math.min(c.center - need / 2, available - need));
  const cr = c.crop;

  const filters = [
    `crop=${cr.width}:${cr.height}:${cr.x}:${cr.y ?? 0}`,
    speed !== 1 ? `setpts=${(1 / speed).toFixed(6)}*PTS` : null,
    `scale=${box.w}:${box.h}:flags=lanczos`,
    "setsar=1",
    `fps=${fps}`,
    i === 0 ? `fade=t=in:st=0:d=${fade}` : null,
    i === segments.length - 1 ? `fade=t=out:st=${round(dur - fade)}:d=${fade}` : null,
  ].filter(Boolean);

  const out = path.join(segDir, `${String(i).padStart(2, "0")}.mp4`);
  await ffmpeg([
    "-ss", String(inPoint), "-t", String(round(need + 0.2, 4)), "-i", path.join(pool, c.file),
    "-vf", filters.join(","), "-t", String(dur), "-an",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", out,
  ]);
  files.push(out);
  console.log(
    `  ${String(i + 1).padStart(2)} ${c.file.slice(0, 38).padEnd(38)} ${dur.toFixed(2)}s` +
    `  speed ${speed}  in ${inPoint.toFixed(2)}${s.label ? "  [label]" : ""}`,
  );
}

// --- corner labels over the entry-card clips ------------------------------
if (m.labels && Object.keys(m.labels).length) {
  const { renderLowerThirdOverlay } = await import("./render-lower-third-overlay.mjs");
  for (const [idx, label] of Object.entries(m.labels)) {
    const n = Number(idx);
    const seg = files[n];
    const segSeconds = round(segments[n].end - segments[n].start);
    const mov = path.join(segDir, `label-${n}.mov`);
    // White lockup on a scrim falling from the TOP of the footage box: "dark"
    // surface is what makes the box white, "top" puts the gradient on that edge.
    await renderLowerThirdOverlay(
      {
        ...label, anchor: "right", surface: "dark", placement: "top", scrim: true,
        safeInsetPx: 20, fontScale: m.labelFontScale ?? 0.75, holdSeconds: segSeconds + 5,
        width: box.w, height: box.h, fps, durationInFrames: Math.round(segSeconds * fps),
      },
      mov,
      { projectRoot: process.cwd() },
    );
    const tmp = path.join(segDir, `labelled-${n}.mp4`);
    await ffmpeg([
      "-i", seg, "-i", mov, "-filter_complex", "[0:v][1:v]overlay=0:0[v]", "-map", "[v]", "-an",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", tmp,
    ]);
    await fs.rename(tmp, seg);
    console.log(`  label on clip ${n + 1}: ${label.fact} / ${label.name}`);
  }
}

// --- assemble and deliver --------------------------------------------------
const total = round(bounds[bounds.length - 1]);
const listFile = await writeConcatList(segDir, files, "footage.txt");
const track = path.join(work, "footage-track.mp4");
await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", track]);

const enc = [
  "-c:v", "libx264", "-preset", delivery.preset ?? "medium",
  "-crf", String(delivery.crf ?? 24),
  "-maxrate", delivery.maxrate ?? "6M", "-bufsize", delivery.bufsize ?? "12M",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
];

const clipsOnly = path.join(work, "clips-only.mp4");
await ffmpeg([
  "-f", "lavfi", "-t", String(total), "-i", `color=c=black:s=${frame.w}x${frame.h}:r=${fps}`,
  "-i", track, "-filter_complex", `[0:v][1:v]overlay=0:${box.y}[v]`, "-map", "[v]", "-an",
  "-t", String(total), ...enc, clipsOnly,
]);

const silent = path.join(work, "complete-silent.mp4");
await ffmpeg([
  "-i", clipsOnly, "-i", resolve(m, m.board.retimed),
  "-filter_complex", "[0:v][1:v]overlay=0:0[v]", "-map", "[v]", "-an",
  "-t", String(total), ...enc, silent,
]);

// --- mux the chosen voiceover ---------------------------------------------
const pick = m.audio?.pick ?? "mastered";
const voice = m.audio?.[pick];
let final = silent;
if (voice) {
  final = path.join(work, `${m.event?.slug ?? "recap"}.mp4`);
  await ffmpeg([
    "-i", silent, "-i", resolve(m, voice), "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", final,
  ]);
} else {
  console.log("\nno manifest.audio.pick set, leaving the cut silent");
}

const sizeMb = (f) => fs.stat(f).then((s) => (s.size / 1e6).toFixed(1));
console.log("");
for (const f of [track, clipsOnly, final]) {
  console.log(`  ${path.basename(f).padEnd(28)} ${(await duration(f)).toFixed(2)}s  ${await sizeMb(f)} MB`);
}
const mb = Number(await sizeMb(final));
if (mb > 60) {
  console.log(`\n  ${mb} MB is above the ~40 MB that publishes reliably. Raise delivery.crf.`);
}

m.outputs = {
  ...(m.outputs ?? {}),
  clipsOnly: path.relative(m.__dir, clipsOnly),
  final: path.relative(m.__dir, final),
  duration: round(await duration(final)),
  sizeMb: mb,
};
await saveManifest(m);
console.log(`\nmanifest updated (rev ${m.revision})`);
