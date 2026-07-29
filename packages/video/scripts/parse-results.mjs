#!/usr/bin/env node
/**
 * Turn a Pronto Timing System results page into a leaderboard config.
 *
 * Stage 1 of the narrated recap. Everything downstream is derived from these
 * numbers, so this is the one place where being approximately right is worse
 * than failing loudly.
 *
 * WHY NOT JUST READ THE PAGE. Handing this to a summarizing fetch dropped an
 * entire run and garbled figures on KCRX E5. Separately, a hand-built config
 * had two of one driver's runs transposed with the wrong cone flags; the errors
 * cancelled, the total still reconciled, and every intermediate board from run
 * 5 onward was wrong while looking completely plausible. Both failures are the
 * same shape: a number that is wrong but not obviously wrong.
 *
 * HOW THE TOTAL IS FOUND, AND WHY IT IS THE WHOLE TRICK. Pronto renders the
 * total as a rowspan, so in document order a driver reads:
 *
 *     header, runs 1..n-1, TOTAL, run n, (gap), <next driver's header>
 *
 * The total sits in the MIDDLE of the runs and driver rows bleed into each
 * other, so positional parsing is guesswork that breaks on a different run
 * count. Instead every time-like token in a driver's block is collected and the
 * total is identified as the one that equals the sum of the others. That makes
 * the reconciliation and the parse the same operation: if no token balances the
 * rest, the parse is wrong and the script refuses rather than emitting a
 * confident, subtly broken config.
 *
 * Times are CREDITED: `47.611(1)` is 47.611 seconds INCLUDING the two-second
 * penalty for one cone, not 47.611 plus a cone. A gap on the finished board is
 * therefore not a pace difference, which matters when writing the script.
 *
 * DNFs score as slowest in class on that run plus ten, per SCCA rallycross
 * rules. That needs every driver's time for the run, so it is a second pass.
 *
 * SCOPE: rallycross only. Rallycross ranks on the SUM of every run, which is
 * what makes the total findable and the reconciliation possible. Autocross and
 * track rank on best lap and carry no cumulative total, so they are a different
 * read and a different `eventType` — the script detects that case and says so
 * rather than pretending. See "The data contract" in README.md.
 *
 * Usage:
 *   node scripts/parse-results.mjs <url|file.html> --class MR [options]
 *
 *   --class <code>        class to extract (required, e.g. MR)
 *   --out <file.json>     write a leaderboard config
 *   --featured <a,b,c>    first names to feature
 *   --event-date <text>   title-bar date, e.g. 7.19.26
 *   --title <text>        override the title
 *   --roster <file.json>  { "Ian": "90 MIATA - RED BOMBER" } car labels that
 *                         override the sheet's. The timing system knows the
 *                         year, make and model but not what the car is called,
 *                         and the nickname is the part worth putting on screen.
 *   --cone-penalty <sec>  default 2
 *   --dnf-penalty <sec>   default 10
 */
import fs from "node:fs/promises";
import { usage, round } from "./recap-core.mjs";

const CONE_DEFAULT = 2;
const DNF_DEFAULT = 10;

// --- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
const source = argv[0];
if (!source || source.startsWith("--")) {
  usage("Usage: node scripts/parse-results.mjs <url|file.html> --class MR [--out config.json]");
}
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const klass = flag("class");
if (!klass) usage("--class is required (the class code, e.g. MR)");
const conePenalty = Number(flag("cone-penalty", CONE_DEFAULT));
const dnfPenalty = Number(flag("dnf-penalty", DNF_DEFAULT));

// --- fetch ----------------------------------------------------------------
let html;
if (/^https?:\/\//i.test(source)) {
  const res = await fetch(source);
  if (!res.ok) usage(`fetch failed: ${res.status} ${res.statusText}`);
  // Pronto serves iso-8859-1 and says so in a meta tag, not a header.
  html = new TextDecoder("iso-8859-1").decode(await res.arrayBuffer());
} else {
  html = await fs.readFile(source, { encoding: "latin1" });
}

// --- flatten to a cell stream ---------------------------------------------
// Whitespace is collapsed, not just trimmed: Pronto's cells carry embedded
// newlines and the class heading runs into the next table's header row, so a
// bare trim leaves multi-line cells that break the token shapes below.
const strip = (s) => s
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/\s+/g, " ")
  .trim();

const cells = [...html.matchAll(/<T[DH][^>]*>([\s\S]*?)<\/T[DH]>/gi)]
  .map((m) => strip(m[1]))
  .filter((c) => c !== "" && c !== "T");

// --- token shapes ---------------------------------------------------------
// 47.611 | 47.611(1) | 1:01.040(4) | 6:45.260
const TIME = /^(\d+:)?\d+\.\d{1,3}(\((\d+)\))?$/;
// a standalone parenthesised gap: (1.466). Distinct from a cone count, which is
// always attached to a time.
const GAP = /^\(\d+\.\d+\)$/;
const DID_NOT = /^(DNF|DNS|DSQ|RRN)$/i;

const seconds = (t) => {
  const [, mm, ss] = /^(?:(\d+):)?([\d.]+)$/.exec(t) ?? [];
  return (mm ? Number(mm) * 60 : 0) + Number(ss);
};
const parseTime = (tok) => {
  const m = TIME.exec(tok);
  if (!m) return null;
  return { seconds: seconds(tok.replace(/\(.*/, "")), cones: m[3] ? Number(m[3]) : 0 };
};

// --- locate the class block ------------------------------------------------
const heading = new RegExp(`Class standings for\\s+${klass}\\b`, "i");
const startCell = cells.findIndex((c) => heading.test(c));
if (startCell === -1) {
  const found = cells
    .map((c) => /Class standings for\s+(\S+)\s*(\[\s*\d+\s+Cars?\s*\])?/i.exec(c))
    .filter(Boolean)
    .map((m) => `${m[1]}${m[2] ? ` ${m[2]}` : ""}`);
  usage(`class ${klass} not found. This page has: ${found.join(", ") || "no class standings"}`);
}
// Everything up to the next class heading (or the end) belongs to this class.
const endRel = cells.slice(startCell + 1).findIndex((c) => /Class standings for/i.test(c));
const block = cells.slice(startCell + 1, endRel === -1 ? undefined : startCell + 1 + endRel);

const carCount = Number(/\[(\d+)\s+Cars?\]/i.exec(cells[startCell])?.[1] ?? 0);

// --- split the block into drivers -----------------------------------------
// A driver starts at a name: letters and spaces, not a header word, not a time.
const HEADER_WORDS = /^(Pos|Car #?|Name|Car|TOTAL|Diff|Tire|Class|T)$/i;
const isName = (c) => /^[A-Za-z][A-Za-z.'\- ]*[A-Za-z]$/.test(c) &&
  !HEADER_WORDS.test(c) && !DID_NOT.test(c) && c.includes(" ");

const starts = [];
block.forEach((c, i) => { if (isName(c)) starts.push(i); });
if (!starts.length) usage(`found the ${klass} heading but no driver rows under it`);

const drivers = [];
const unbalanced = [];
for (const [n, at] of starts.entries()) {
  const to = starts[n + 1] ?? block.length;
  const name = block[at];
  const car = block[at + 1] ?? "";
  const body = block.slice(at + 2, to);

  // every time-like token in this driver's stretch, in document order
  const tokens = [];
  for (const c of body) {
    if (GAP.test(c)) continue;                       // gap to the leader, not a run
    if (DID_NOT.test(c)) { tokens.push({ dnf: c.toUpperCase() }); continue; }
    const t = parseTime(c);
    if (t) tokens.push(t);
  }
  if (tokens.length < 2) usage(`${name}: no times found`);

  // The total is the token equal to the sum of all the others. DNF placeholders
  // score nothing yet, so a driver with one is reconciled in the second pass.
  const dnfCount = tokens.filter((t) => t.dnf).length;
  let totalIdx = -1;
  if (dnfCount === 0) {
    const sumAll = tokens.reduce((a, t) => a + t.seconds, 0);
    for (const [i, t] of tokens.entries()) {
      if (Math.abs(sumAll - t.seconds - t.seconds) < 0.02) { totalIdx = i; break; }
    }
    if (totalIdx === -1) {
      // Don't fail yet. One driver failing to balance means corrupt data; EVERY
      // driver failing means there is no cumulative total on this sheet at all,
      // which is an autocross or track result rather than a broken rallycross
      // one. Those are ranked by best lap, not by a sum, so the difference is
      // worth reporting accurately instead of calling the sheet malformed.
      unbalanced.push({ name, tokens });
      continue;
    }
  } else {
    // Can't balance yet. Pronto puts the total immediately after run n-1, which
    // is the only token whose value exceeds every other by a wide margin.
    totalIdx = tokens.reduce((best, t, i) =>
      (!t.dnf && (best === -1 || t.seconds > tokens[best].seconds) ? i : best), -1);
  }

  const total = tokens[totalIdx];
  const runs = tokens.filter((_, i) => i !== totalIdx);
  drivers.push({ name, car, runs, total: total.seconds, dnfCount });
}

if (unbalanced.length) {
  if (drivers.length === 0) {
    usage(
      `No driver in ${klass} has a cumulative total, so this is not a rallycross sheet.\n` +
      `  parse-results currently reads rallycross only, which ranks on the sum of every run.\n` +
      `  Autocross and track rank on best lap and carry no total, so they need their own\n` +
      `  reader and a different eventType. See "The data contract" in packages/video/README.md.`,
    );
  }
  const shown = unbalanced
    .map((u) => `  ${u.name}: ${u.tokens.map((t) => (t.dnf ? t.dnf : t.seconds.toFixed(3))).join(" ")}`)
    .join("\n");
  usage(
    `${unbalanced.length} of ${drivers.length + unbalanced.length} drivers have no token that ` +
    `balances the others, so the parse is wrong:\n${shown}`,
  );
}

// --- second pass: score the DNFs ------------------------------------------
// Slowest credited time in class for that run, plus ten.
const runCount = Math.max(...drivers.map((d) => d.runs.length));
for (let r = 0; r < runCount; r++) {
  const finished = drivers.map((d) => d.runs[r]).filter((t) => t && !t.dnf);
  if (!finished.length) continue;
  const slowest = Math.max(...finished.map((t) => t.seconds));
  for (const d of drivers) {
    const t = d.runs[r];
    if (t?.dnf) {
      t.seconds = round(slowest + dnfPenalty);
      t.cones = 0;
      t.scoredFrom = { slowest, penalty: dnfPenalty };
    }
  }
}

// --- verify ---------------------------------------------------------------
// Per run, never on totals alone: a transposition inside a driver's runs leaves
// the total correct while every intermediate standing is wrong.
const problems = [];
for (const d of drivers) {
  if (d.runs.length !== runCount) {
    problems.push(`${d.name}: ${d.runs.length} runs, expected ${runCount}`);
  }
  const sum = round(d.runs.reduce((a, t) => a + t.seconds, 0));
  if (Math.abs(sum - d.total) > 0.02) {
    problems.push(`${d.name}: runs sum to ${sum} but the sheet says ${d.total}`);
  }
}
if (carCount && drivers.length !== carCount) {
  problems.push(`heading says ${carCount} cars, parsed ${drivers.length}`);
}
if (problems.length) {
  console.error(`\nParse did not reconcile:\n${problems.map((p) => `  ${p}`).join("\n")}\n`);
  process.exit(1);
}

// --- report ---------------------------------------------------------------
const shortName = (full) => full.split(/\s+/)[0];
const carLabel = (raw) => {
  const m = /^(\d{4})\s+(.*)$/.exec(raw);
  return (m ? `${m[1].slice(2)} ${m[2]}` : raw).toUpperCase();
};

drivers.sort((a, b) => a.total - b.total);
const leader = drivers[0].total;
console.log(`\n${klass}, ${runCount} runs, ${drivers.length} drivers\n`);
console.log(`${"pos".padStart(3)} ${"driver".padEnd(18)}${"total".padStart(10)}${"gap".padStart(10)}${"cones".padStart(7)}`);
for (const [i, d] of drivers.entries()) {
  const cones = d.runs.reduce((a, t) => a + (t.cones ?? 0), 0);
  console.log(
    `${String(i + 1).padStart(3)} ${d.name.padEnd(18)}${d.total.toFixed(3).padStart(10)}` +
    `${(i ? `+${(d.total - leader).toFixed(3)}` : "—").padStart(10)}${String(cones).padStart(7)}` +
    (d.dnfCount ? `   ${d.dnfCount} DNF scored as slowest +${dnfPenalty}` : ""),
  );
}

// --- emit -----------------------------------------------------------------
const outPath = flag("out");
if (!outPath) {
  console.log(`\n(no --out given, nothing written)`);
  process.exit(0);
}
const featured = (flag("featured") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const rosterPath = flag("roster");
const roster = rosterPath ? JSON.parse(await fs.readFile(rosterPath, "utf-8")) : {};

const config = {
  eventType: "rallycross",
  title: flag("title") ?? `KCRX · ${klass}`,
  eventDate: flag("event-date") ?? "",
  featured,
  racers: drivers.map((d) => {
    const short = shortName(d.name);
    return {
      name: short,
      car: roster[short] ?? roster[d.name] ?? carLabel(d.car),
      runs: d.runs.map((t) => round(t.seconds)),
      cones: d.runs.map((t) => t.cones ?? 0),
      total: round(d.total),
    };
  }),
};
await fs.writeFile(outPath, JSON.stringify(config, null, 2) + "\n");
console.log(`\nwrote ${outPath}`);

const unnamed = drivers
  .map((d) => shortName(d.name))
  .filter((n) => !(n in roster));
if (unnamed.length) {
  console.log(`  car label taken from the sheet for: ${unnamed.join(", ")}`);
  console.log(`  pass --roster to give any of them their nickname instead`);
}
if (conePenalty !== CONE_DEFAULT) console.log(`  cone penalty ${conePenalty}s`);
