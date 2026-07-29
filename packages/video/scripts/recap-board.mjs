#!/usr/bin/env node
/**
 * Stage 6a of the narrated recap: retime the rendered board to the voiceover.
 *
 * The board renders at its own natural pace, then each card is stretched or
 * trimmed to the length of the section Ian speaks over it. This is the step
 * that makes the picture follow the voice instead of the other way round.
 *
 * HOLDS ONLY. A card is [transition][hold]: roughly 1.7s of label push and row
 * slide, then a static board. Length is changed by editing the HOLD, trimming
 * by cutting frames out of it and extending by freezing on it. Transitions
 * always play at native speed. That is the whole trick: speed-ramping a
 * transition reads instantly as a speed change, whereas holding a static board
 * a beat longer reads as an edit and is invisible.
 *
 * The final card is special. Its drawer exit lives at the very end, so that
 * tail is carried separately rather than being frozen away.
 *
 * Usage: node scripts/recap-board.mjs <manifest.json>
 *
 * Reads  manifest.board.source      the rendered board (alpha .mov)
 *        manifest.board.cards[]     card boundaries IN THE RENDER, seconds
 *        manifest.cards[]           [{ id, start, end }] from the voiceover
 * Writes manifest.board.retimed
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  ffmpeg, loadManifest, saveManifest, resolve, duration, round,
  writeConcatList, usage,
} from "./recap-core.mjs";

const [manifestPath] = process.argv.slice(2);
if (!manifestPath) usage("Usage: node scripts/recap-board.mjs <manifest.json>");

const m = await loadManifest(manifestPath);
const board = m.board ?? {};
if (!board.source) usage("manifest.board.source is required (render it with render-board-overlay.mjs)");
if (!board.cards?.length) usage("manifest.board.cards is required (card boundaries in the render)");
if (!m.cards?.length) usage("manifest.cards is required (card boundaries from the voiceover)");

const src = resolve(m, board.source);
const fps = m.fps ?? 30;

// How much of each card is transition rather than hold. The entry card has a
// long reveal (rows landing one at a time, then the fade-back) so it needs a
// much bigger floor than a run card's label push.
const TRANSITION = board.transitionSeconds ?? 2.6;
const ENTRY_REVEAL = board.entryRevealSeconds ?? 6.0;
const TAIL = board.finalTailSeconds ?? 1.6;

const targets = m.cards.map((c) => round(c.end - c.start));
if (targets.length !== board.cards.length - 1) {
  usage(`have ${targets.length} voiceover cards but ${board.cards.length - 1} card slots in the board render`);
}

const work = resolve(m, m.work ?? ".");
const segDir = path.join(work, "board-segments");
await fs.rm(segDir, { recursive: true, force: true });
await fs.mkdir(segDir, { recursive: true });

const PRORES = ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"];
const files = [];

for (const [i, want] of targets.entries()) {
  const from = board.cards[i];
  const to = board.cards[i + 1];
  const have = round(to - from);
  const natural = i === 0 ? ENTRY_REVEAL : TRANSITION;
  const idx = String(i).padStart(2, "0");
  const isLast = i === targets.length - 1;

  if (isLast) {
    // head at native speed, freeze the middle, then carry the real drawer exit
    const body = round(want - TAIL);
    const head = path.join(segDir, `${idx}a.mov`);
    const held = path.join(segDir, `${idx}b.mov`);
    const tail = path.join(segDir, `${idx}c.mov`);
    const still = path.join(segDir, `${idx}.png`);

    await ffmpeg(["-ss", String(from), "-t", String(natural), "-i", src, ...PRORES, head]);
    await ffmpeg(["-ss", String(round(from + natural)), "-i", src, "-frames:v", "1", "-pix_fmt", "rgba", still]);
    await ffmpeg(["-loop", "1", "-t", String(Math.max(0, round(body - natural))), "-i", still, "-r", String(fps), ...PRORES, held]);
    await ffmpeg(["-ss", String(round(to - TAIL)), "-t", String(TAIL), "-i", src, ...PRORES, tail]);
    files.push(head, held, tail);
  } else if (want <= natural) {
    // shorter than the transition itself: take it straight, nothing to hold
    const only = path.join(segDir, `${idx}a.mov`);
    await ffmpeg(["-ss", String(from), "-t", String(want), "-i", src, ...PRORES, only]);
    files.push(only);
  } else {
    const head = path.join(segDir, `${idx}a.mov`);
    const held = path.join(segDir, `${idx}b.mov`);
    const still = path.join(segDir, `${idx}.png`);
    await ffmpeg(["-ss", String(from), "-t", String(natural), "-i", src, ...PRORES, head]);
    await ffmpeg(["-ss", String(round(from + natural)), "-i", src, "-frames:v", "1", "-pix_fmt", "rgba", still]);
    await ffmpeg(["-loop", "1", "-t", String(round(want - natural)), "-i", still, "-r", String(fps), ...PRORES, held]);
    files.push(head, held);
  }

  const delta = want - have;
  console.log(
    `  ${String(i).padStart(2)} ${(m.cards[i].id ?? "").padEnd(10)}` +
    ` ${have.toFixed(2)}s -> ${want.toFixed(2)}s  ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` +
    (want <= natural ? "   (under the transition, no hold)" : ""),
  );
}

const listFile = await writeConcatList(segDir, files, "board.txt");
const out = path.join(work, "board-retimed.mov");
await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", out]);

const got = round(await duration(out));
const wanted = round(targets.reduce((a, b) => a + b, 0));
console.log(`\nretimed board: ${got}s (target ${wanted}s, ${round(got - wanted)}s of frame rounding)`);

m.board = { ...board, retimed: path.relative(m.__dir, out), retimedDuration: got };
await saveManifest(m);
console.log(`manifest updated (rev ${m.revision})`);
