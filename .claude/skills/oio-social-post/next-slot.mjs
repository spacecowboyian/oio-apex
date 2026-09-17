#!/usr/bin/env node
// Next posting slot(s) for the OIO Social Posts album.
//
//   node .claude/skills/oio-social-post/next-slot.mjs --after <ISO> [--count N] [--now <ISO>]
//
// Rules (Ian, 2026-09-17): posts go out a random 4–8 hours apart, and only
// between 08:00 and 20:00 America/Chicago. A slot that lands outside that
// window rolls to the next window opening plus up to 45 minutes of jitter,
// so mornings don't all post on the dot. `--after` is the latest
// scheduled_at/posted_at for this album; slots never land before now + 5 min.
// Prints one ISO UTC timestamp per line.

const TZ = "America/Chicago";
const OPEN_HOUR = 8;
const CLOSE_HOUR = 20;
const MIN_GAP_H = 4;
const MAX_GAP_H = 8;
const OPEN_JITTER_MIN = 45;

const HOUR = 3600_000;
const MINUTE = 60_000;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// Wall-clock parts of `date` in TZ.
function localParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}

// UTC instant for a wall-clock time in TZ (DST-safe: correct the guess by the observed offset).
function zonedToUtc(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = localParts(new Date(guess));
  const offset = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - guess;
  return new Date(guess - offset);
}

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

function intoWindow(date) {
  const p = localParts(date);
  if (p.h >= OPEN_HOUR && p.h < CLOSE_HOUR) return date;
  // Before opening -> today's opening; after closing -> tomorrow's.
  const base = zonedToUtc(p.y, p.mo, p.d, OPEN_HOUR, 0);
  const opening = p.h < OPEN_HOUR ? base : new Date(base.getTime() + 24 * HOUR);
  // Re-anchor through local parts so a DST change overnight still opens at 08:00.
  const q = localParts(new Date(opening.getTime() + HOUR));
  const open = zonedToUtc(q.y, q.mo, q.d, OPEN_HOUR, 0);
  return new Date(open.getTime() + Math.round(rand(0, OPEN_JITTER_MIN)) * MINUTE);
}

const after = new Date(arg("--after", new Date().toISOString()));
const now = new Date(arg("--now", new Date().toISOString()));
const count = Number(arg("--count", "1"));
if (Number.isNaN(after.getTime()) || Number.isNaN(now.getTime()) || !(count >= 1)) {
  console.error("Usage: next-slot.mjs --after <ISO> [--count N] [--now <ISO>]");
  process.exit(1);
}

let last = after;
for (let i = 0; i < count; i++) {
  const gap = Math.round(rand(MIN_GAP_H * 60, MAX_GAP_H * 60)) * MINUTE;
  const earliest = new Date(now.getTime() + 5 * MINUTE);
  let slot = new Date(Math.max(last.getTime() + gap, earliest.getTime()));
  slot = intoWindow(slot);
  slot.setUTCSeconds(0, 0);
  console.log(slot.toISOString());
  last = slot;
}
