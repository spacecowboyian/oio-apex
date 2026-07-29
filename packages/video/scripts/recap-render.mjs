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
 * ENCODING. Segments are cut at CRF 18 because they are an intermediate and
 * feed a second encode; the delivered files are CRF ~24. Only the DELIVERED
 * size matters for publishing — a CRF 18 file of this length lands near 100 MB
 * and Post-Bridge fails it on Facebook with a bare "Failed to process video",
 * while ~40 MB publishes first try (Brains
 * `canonical/postbridge-video-publishing.md`). The large `footage-track.mp4` is
 * a working file and is never uploaded.
 *
 * Each delivered frame is therefore encoded twice: once as a segment, once in
 * the composite, which overlay cannot avoid. It used to be three times, because
 * the board was composited onto the already-encoded `clips-only.mp4` rather
 * than onto the footage track — a same-CRF re-encode that cost quality and
 * bought nothing.
 *
 * Usage: node scripts/recap-render.mjs <manifest.json>
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  ffmpeg, loadManifest, saveManifest, resolve, duration, expectDuration,
  assertContiguousCards, scheduleClips, round, writeConcatList, usage,
} from "./recap-core.mjs";

const [manifestPath] = process.argv.slice(2);
if (!manifestPath) usage("Usage: node scripts/recap-render.mjs <manifest.json>");

const m = await loadManifest(manifestPath);
if (!m.cards?.length) usage("manifest.cards is required");
assertContiguousCards(m.cards);
if (!m.layout) usage("manifest.layout is required (layout.json from the clip layout tool)");
if (!m.board?.retimed) usage("manifest.board.retimed is required (run recap-board.mjs first)");

const fps = m.fps ?? 30;
const frame = m.frame ?? { w: 1080, h: 1920 };
const box = m.box ?? { w: 1080, h: 900, y: 1020 };
const fade = m.fadeSeconds ?? 0.6;
const entryClips = m.entryCardClips ?? 3;
const delivery = m.delivery ?? { crf: 24, maxrate: "6M", bufsize: "12M", preset: "medium" };
// Intermediate quality: high, because these feed the composite encode. Size here
// is irrelevant, only the delivered file's size is.
const segmentEncode = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p"];

const pool = resolve(m, m.pool);
const work = resolve(m, m.work ?? ".");
const layout = JSON.parse(await fs.readFile(resolve(m, m.layout), "utf-8"));
const clips = layout.clips.filter((c) => c.enabled !== false);
// A missing `order` makes the comparator NaN and leaves the running order
// unspecified, which silently puts the wrong car on the wrong card.
const orders = new Set();
for (const c of clips) {
  if (!Number.isFinite(c.order)) usage(`${c.file} has no numeric order in the layout`);
  if (orders.has(c.order)) usage(`two clips share order ${c.order}; the running order is ambiguous`);
  orders.add(c.order);
}
clips.sort((a, b) => a.order - b.order);

// --- schedule: which clip covers which stretch of time ---------------------
const bounds = [...m.cards.map((c) => c.start), m.cards[m.cards.length - 1].end];
let slots, spare;
try {
  ({ slots, spare } = scheduleClips(m.cards, clips, entryClips));
} catch (err) {
  usage(err.message);
}
const segments = slots.map((s) => ({
  ...s,
  label: s.entryIndex === undefined ? undefined : (m.labels ?? {})[String(s.entryIndex)],
}));
console.log(`${clips.length} clips enabled, ${segments.length} slots`);
if (spare.length) console.log(`  not used: ${spare.map((c) => `${c.file} @ ${c.center}`).join(", ")}`);

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
  // Required, not defaulted. `?? Infinity` made the check below unfireable AND
  // left `inPoint` unclamped, so `-ss` could land past the end of the clip —
  // where ffmpeg writes a short segment and exits 0.
  const available = c.source?.duration;
  if (!Number.isFinite(available)) {
    usage(`${c.file} has no source.duration in the layout, so its window cannot be clamped. Re-save the layout.`);
  }
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
    ...segmentEncode, out,
  ]);
  await expectDuration(out, dur, { label: `slot ${i + 1} (${c.file})` });
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
    if (!Number.isInteger(n) || n < 0 || n >= entryClips) {
      usage(`manifest.labels key "${idx}" is not an entry-card clip index (0..${entryClips - 1}). ` +
            `A key outside that range labels the wrong clip or crashes in ffmpeg.`);
    }
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
      ...segmentEncode, tmp,
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

// Built from the footage TRACK, not from clips-only. Chaining off clips-only
// re-encoded already-encoded frames at the same CRF: generation loss for no
// size benefit. Composing black + footage + board in one graph means each
// delivered frame is encoded twice (segment, composite) rather than three times.
const silent = path.join(work, "complete-silent.mp4");
await ffmpeg([
  "-f", "lavfi", "-t", String(total), "-i", `color=c=black:s=${frame.w}x${frame.h}:r=${fps}`,
  "-i", track, "-i", resolve(m, m.board.retimed),
  "-filter_complex", `[0:v][1:v]overlay=0:${box.y}[a];[a][2:v]overlay=0:0[v]`,
  "-map", "[v]", "-an", "-t", String(total), ...enc, silent,
]);

// --- mux the chosen voiceover ---------------------------------------------
// Not defaulted. recap-vo deliberately refuses to choose between straight and
// mastered, so defaulting here would quietly make the choice it declined to.
// And an unresolvable pick used to write a SILENT video while reporting "no
// pick set", which is both wrong and a misleading reason.
const pick = m.audio?.pick;
if (pick && !m.audio?.[pick]) {
  usage(`manifest.audio.pick is "${pick}" but manifest.audio has no such path. ` +
        `Expected "straight" or "mastered" — run recap-vo.mjs first.`);
}
const voice = pick ? m.audio[pick] : null;
let final = silent;
if (voice) {
  final = path.join(work, `${m.event?.slug ?? "recap"}.mp4`);
  await ffmpeg([
    "-i", silent, "-i", resolve(m, voice), "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", final,
  ]);
} else {
  console.log("\nmanifest.audio.pick is not set, so the cut is silent. " +
              "Play both versions and set it to \"straight\" or \"mastered\".");
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
