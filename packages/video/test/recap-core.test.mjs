/**
 * The pure pieces of recap-core.
 *
 * Everything that shells out to ffmpeg is deliberately not here — mocking
 * execFile buys assertions about argv strings, not about behaviour. What is
 * here is the logic that decides things, and specifically the two functions
 * where a wrong answer produces a plausible-looking video rather than a crash.
 *
 * Run: npm test -w @oio/video
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  snapToQuiet, assertContiguousCards, scheduleClips, finiteNumber, saveManifest, loadManifest,
} from "../scripts/recap-core.mjs";

// --- snapToQuiet -----------------------------------------------------------
// 10ms hops. Index i covers [i*hop, i*hop + window).
const HOP = 0.01;

test("snapToQuiet does not cross a syllable to reach a quieter dip", () => {
  // The KCRX E5 regression, in miniature. A dip BETWEEN PHONEMES of the
  // preceding word (-55 dB at 0.95s) is quieter than the actual gap between
  // words (-45 dB around 1.07s). A plain window minimum jumps to the dip and
  // cuts inside the previous word, which stutters the join.
  const env = new Array(200).fill(-20);       // speech either side
  for (let i = 93; i <= 97; i++) env[i] = -55; // intra-word dip
  for (let i = 104; i <= 110; i++) env[i] = -45; // the real gap
  env[107] = -48;                              // quietest point IN the gap

  const naive = (() => {
    let best = 82;
    for (let i = 82; i < 132; i++) if (env[i] < env[best]) best = i;
    return best * HOP;
  })();
  assert.equal(+naive.toFixed(2), 0.93, "a plain window minimum lands in the previous word");

  const { t } = snapToQuiet(env, HOP, 1.07, 0.25);
  assert.equal(+t.toFixed(2), 1.07, "the band-limited walk stays in the gap it started in");
});

test("snapToQuiet settles on the quietest point within its own gap", () => {
  const env = new Array(200).fill(-20);
  for (let i = 100; i <= 120; i++) env[i] = -50;
  env[115] = -62;                              // quietest, same contiguous gap
  const { t, db } = snapToQuiet(env, HOP, 1.05, 0.25);
  assert.equal(+t.toFixed(2), 1.15);
  assert.equal(db, -62);
});

test("snapToQuiet stops where the level climbs past the band", () => {
  // The bound is `env[at] + band`, inclusive. A neighbour exactly at the limit
  // is walked through; one dB louder blocks. Pinning this because the whole
  // guard is that comparison.
  const atLimit = new Array(60).fill(-20);
  for (let i = 20; i <= 30; i++) atLimit[i] = -40;
  atLimit[31] = -34;                            // exactly -40 + 6
  atLimit[32] = -70;                            // quieter, but beyond the edge
  assert.equal(+snapToQuiet(atLimit, HOP, 0.25, 0.25).t.toFixed(2), 0.32,
    "a neighbour exactly at the band is passable");

  const overLimit = [...atLimit];
  overLimit[31] = -33;                          // one dB louder
  const blocked = snapToQuiet(overLimit, HOP, 0.25, 0.25);
  assert.equal(blocked.db, -40, "the quieter point beyond the edge is not reached");
  // The seed is kept when nothing inside the valley is strictly quieter, rather
  // than sliding to the first equally-quiet hop. Least movement is the right
  // default for a cut point a human chose.
  assert.equal(+blocked.t.toFixed(2), 0.25);
});

test("snapToQuiet never returns a time outside the envelope", () => {
  const env = new Array(50).fill(-30);
  assert.ok(snapToQuiet(env, HOP, 999, 0.25).t <= 49 * HOP, "a time past the end clamps");
  assert.equal(snapToQuiet([], HOP, 1.0, 0.25).t, 1.0, "an empty envelope returns the request");
});

// --- assertContiguousCards -------------------------------------------------
const cards = (...pairs) => pairs.map(([start, end], i) => ({ id: `c${i}`, start, end }));

test("assertContiguousCards accepts a tiled timeline", () => {
  assert.doesNotThrow(() => assertContiguousCards(cards([0, 10], [10, 25], [25, 30])));
});

test("assertContiguousCards rejects a gap, an overlap and a late start", () => {
  // A gap is the dangerous one: the board sums (end - start) while the footage
  // uses the distance between starts, so they silently disagree from there on.
  assert.throws(() => assertContiguousCards(cards([0, 10], [10.2, 25])), /contiguous/);
  assert.throws(() => assertContiguousCards(cards([0, 10], [9.5, 25])), /contiguous/);
  assert.throws(() => assertContiguousCards(cards([0.5, 10], [10, 25])), /must be 0/);
  assert.throws(() => assertContiguousCards(cards([0, 0])), /ends at or before/);
  assert.throws(() => assertContiguousCards([]), /empty/);
});

// --- scheduleClips ---------------------------------------------------------
const clipList = (n) => Array.from({ length: n }, (_, i) => ({ file: `c${i}.mov`, order: i }));
const evenCards = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, start: i * 10, end: (i + 1) * 10 }));

test("scheduleClips fills every slot and reports the spare", () => {
  const { slots, spare } = scheduleClips(evenCards(11), clipList(14), 3);
  assert.equal(slots.length, 13);
  assert.equal(spare.length, 1);
  assert.equal(spare[0].file, "c12.mov", "the unused clip is the one between the runs and the closer");
});

test("scheduleClips refuses a layout one clip short instead of repeating one", () => {
  // The silent case: with exactly one too few, the last run card and the final
  // card resolve to the same clip. Nothing is undefined and the spare list is
  // empty, so the only symptom was the same footage playing twice.
  assert.throws(() => scheduleClips(evenCards(11), clipList(12), 3), /both use c11\.mov/);
  assert.throws(() => scheduleClips(evenCards(8), clipList(9), 3), /both use c8\.mov/);
});

test("scheduleClips splits the entry card evenly", () => {
  const { slots } = scheduleClips(evenCards(11), clipList(14), 3);
  const entry = slots.slice(0, 3);
  for (const s of entry) assert.ok(Math.abs((s.end - s.start) - 10 / 3) < 1e-9);
  assert.equal(entry[0].start, 0);
  assert.equal(+entry[2].end.toFixed(6), 10);
});

// --- finiteNumber ----------------------------------------------------------
test("finiteNumber rejects what Number() would silently turn into NaN", () => {
  assert.equal(finiteNumber(undefined, "x", 10), 10);
  assert.equal(finiteNumber("2.5", "x", 10), 2.5);
  assert.throws(() => finiteNumber("10s", "dnf-penalty"), /needs a number/);
  assert.throws(() => finiteNumber("", "dnf-penalty"), /needs a number/);
});

// --- saveManifest ----------------------------------------------------------
test("saveManifest backs up the previous content before overwriting", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recap-manifest-"));
  const file = path.join(dir, "recap.json");
  fs.writeFileSync(file, JSON.stringify({ event: { slug: "a" } }));

  const m1 = await loadManifest(file);
  m1.event.slug = "b";
  await saveManifest(m1);
  assert.equal(m1.revision, 1);

  const m2 = await loadManifest(file);
  m2.event.slug = "c";
  await saveManifest(m2);
  assert.equal(m2.revision, 2);

  // The tag is the revision being REPLACED, so .1 holds what revision 1 looked
  // like. Distinct filenames per save is the point — a fixed name would have
  // each backup overwrite the last.
  const hist = path.join(dir, ".recap-history");
  assert.deepEqual(fs.readdirSync(hist).sort(), ["recap.json.0", "recap.json.1"]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(hist, "recap.json.0"), "utf-8")).event.slug, "a");
  assert.equal(JSON.parse(fs.readFileSync(path.join(hist, "recap.json.1"), "utf-8")).event.slug, "b");

  const onDisk = JSON.parse(fs.readFileSync(file, "utf-8"));
  assert.equal(onDisk.event.slug, "c");
  assert.ok(!("__file" in onDisk) && !("__dir" in onDisk), "internals are not written to disk");
});
