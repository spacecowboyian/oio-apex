#!/usr/bin/env node
// Spaced posting slots inside a daily window.
//
//   node .claude/skills/oio-post-scheduling/next-slot.mjs --after <ISO> [--count N]
//     [--min-gap-h 4] [--max-gap-h 8] [--open 8] [--close 20] [--tz America/Chicago] [--now <ISO>]
//
// Each slot is a random gap after the previous one (the first after --after).
// A slot outside [open, close) local time rolls to the next opening plus up
// to 45 minutes of jitter, so mornings don't all post on the dot. Slots never
// land before now + 5 min. Prints one ISO UTC timestamp per line.
// Defaults are Ian's everyday cadence (2026-09-17): 4–8h apart, 08:00–20:00 Chicago.

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const TZ = arg("--tz", "America/Chicago");
const OPEN_HOUR = Number(arg("--open", "8"));
const CLOSE_HOUR = Number(arg("--close", "20"));
const MIN_GAP_H = Number(arg("--min-gap-h", "4"));
const MAX_GAP_H = Number(arg("--max-gap-h", "8"));
const OPEN_JITTER_MIN = 45;

const HOUR = 3600_000;
const MINUTE = 60_000;

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
const bad = [after.getTime(), now.getTime(), OPEN_HOUR, CLOSE_HOUR, MIN_GAP_H, MAX_GAP_H].some(Number.isNaN);
if (bad || !(count >= 1) || !(OPEN_HOUR < CLOSE_HOUR) || !(MIN_GAP_H <= MAX_GAP_H)) {
  console.error("Usage: next-slot.mjs --after <ISO> [--count N] [--min-gap-h H] [--max-gap-h H] [--open H] [--close H] [--tz Zone] [--now <ISO>]");
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
