/**
 * parse-results.mjs against a real Pronto Timing System sheet.
 *
 * The fixture is an actual results page with the drivers' names substituted.
 * Everything that matters is untouched: the table structure, the run times, the
 * cone notation, the DNFs, and the class heading. The structure IS the test —
 * Pronto renders the total as a rowspan, so in document order a driver reads
 * header, runs 1..n-1, TOTAL, run n, gap, then the NEXT driver's header bleeding
 * into the same row. A parser that assumes fixed positions passes on a
 * hand-written sample and fails on this.
 *
 * Run: npm test -w @oio/video
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const SCRIPT = path.join(pkg, "scripts", "parse-results.mjs");
const FIXTURE = path.join(here, "fixtures", "pronto-rallycross.html");
const EXPECTED = path.join(here, "fixtures", "pronto-rallycross.expected.json");

/** Run the CLI the way a caller would, and return its result plus any output file. */
function run(args, { readOut } = {}) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf-8" });
  const output = readOut && fs.existsSync(readOut) ? JSON.parse(fs.readFileSync(readOut, "utf-8")) : null;
  return { ...res, output, all: `${res.stdout}${res.stderr}` };
}

function tmpOut(name = "out.json") {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "parse-results-")), name);
}

const golden = JSON.parse(fs.readFileSync(EXPECTED, "utf-8"));

/**
 * Parse the fixture once, for real.
 *
 * The property tests below used to read the checked-in golden file, which meant
 * they asserted things about a JSON literal rather than about the parser:
 * halving the DNF penalty left the test named for it green. They now run
 * against actual output. The deepEqual against `golden` in the first test still
 * ties the two together, so re-blessing a broken golden is still caught.
 */
const actual = (() => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "parse-results-fixture-")), "out.json");
  const res = spawnSync(process.execPath, [SCRIPT, FIXTURE, "--class", "MR",
    "--featured", "Dana,Marco,Tomas", "--event-date", "7.19.26",
    "--title", "EXAMPLE RALLYCROSS · MR", "--out", out], { encoding: "utf-8" });
  if (res.status !== 0) throw new Error(`fixture failed to parse:\n${res.stdout}${res.stderr}`);
  return JSON.parse(fs.readFileSync(out, "utf-8"));
})();

const byName = (cfg) => Object.fromEntries(cfg.racers.map((r) => [r.name, r]));

test("parses the sheet into the expected config", () => {
  const out = tmpOut();
  const { status, output } = run([
    FIXTURE, "--class", "MR", "--featured", "Dana,Marco,Tomas",
    "--event-date", "7.19.26", "--title", "EXAMPLE RALLYCROSS · MR", "--out", out,
  ], { readOut: out });

  assert.equal(status, 0);
  assert.deepEqual(output, golden);
});

test("run times are credited — a coned run already includes the penalty", () => {
  const r = byName(actual);
  // Marco's run 2 is 47.611 WITH one cone, not 47.611 plus one.
  assert.equal(r.Marco.runs[1], 47.611);
  assert.equal(r.Marco.cones[1], 1);
  // and the credited runs sum to the credited total
  const sum = +r.Marco.runs.reduce((a, b) => a + b, 0).toFixed(3);
  assert.equal(sum, r.Marco.total);
});

test("cone counts come off the (n) suffix, including double digits", () => {
  const r = byName(actual);
  assert.equal(r.Dana.cones.reduce((a, b) => a + b, 0), 0);
  assert.equal(r.Marco.cones.reduce((a, b) => a + b, 0), 2);
  // Nils picks up 11, which is what drives the badge's "!" overflow
  assert.equal(r.Nils.cones.reduce((a, b) => a + b, 0), 11);
});

test("DNFs score as slowest in class for that run plus ten", () => {
  const r = byName(actual);
  // Literal expectations, not re-derived with the formula under test. Run 8's
  // slowest finisher is Tomas at 47.630 and run 9's is Tomas at 47.015, so a
  // DNF scores 57.630 and 57.015. Deriving these would pass even if the
  // penalty changed.
  assert.equal(r.Nils.runs[7], 57.630);
  assert.equal(r.Nils.runs[8], 57.015);
});

test("standings and margin survive the round trip", () => {
  const sorted = [...actual.racers].sort((a, b) => a.total - b.total);
  assert.deepEqual(sorted.map((r) => r.name), ["Dana", "Marco", "Priya", "Tomas", "Nils"]);
  assert.equal(+(sorted[1].total - sorted[0].total).toFixed(3), 1.466);
});

test("refuses to emit when the numbers do not reconcile", () => {
  // A total that no longer equals the sum of the runs. The parser identifies the
  // total BY that property, so a corrupted one means it cannot find a total at
  // all — which is the point: it fails rather than guessing.
  const broken = path.join(path.dirname(tmpOut()), "broken.html");
  fs.writeFileSync(broken,
    fs.readFileSync(FIXTURE, "latin1").replace("405.260", "405.999"), "latin1");

  const { status, all } = run([broken, "--class", "MR"]);
  assert.notEqual(status, 0, "should exit non-zero");
  assert.match(all, /1 of 5 drivers have no token that balances/);
  assert.match(all, /46\.765/, "should show the tokens it saw, so the failure is diagnosable");
});

// The corrupted-total case above exits at the total-finding step, so it never
// reaches the FINAL reconciliation block. Two cases below do — the driver-count
// mismatch and the DNF driver — and without them that whole block could be
// deleted with every other test still green. Confirmed by mutation.
test("catches a driver count that disagrees with the class heading", () => {
  const bad = path.join(path.dirname(tmpOut()), "count.html");
  fs.writeFileSync(bad,
    fs.readFileSync(FIXTURE, "latin1").replace("[5 Cars]", "[6 Cars]"), "latin1");

  const { status, all } = run([bad, "--class", "MR"]);
  assert.notEqual(status, 0);
  assert.match(all, /did not reconcile/);
  assert.match(all, /heading says 6 cars, parsed 5/);
});

test("a dropped run cell never yields a short config", () => {
  // Losing a run breaks the sum, so this is caught by the balancing step rather
  // than the end-of-run check — earlier, and with a different message. What
  // matters is that it cannot pass: an 8-run config that looked plausible would
  // put a wrong board on screen for every run after the gap.
  const bad = path.join(path.dirname(tmpOut()), "short.html");
  const src = fs.readFileSync(FIXTURE, "latin1");
  const marker = "<TD>42.909</TD>";
  assert.ok(src.includes(marker), "fixture shape changed; update this test");
  fs.writeFileSync(bad, src.replace(marker, ""), "latin1");

  const { status, all } = run([bad, "--class", "MR"]);
  assert.notEqual(status, 0);
  assert.match(all, /drivers have no token that balances/);
});

test("catches a corrupted run on a DNF driver, which skips the balancing step", () => {
  // A driver with a DNF never goes through the total-by-balancing path — the
  // total is taken as the largest token — so the end-of-run per-driver sum is
  // the ONLY thing guarding them. Nothing else in this file reaches it.
  const bad = path.join(path.dirname(tmpOut()), "dnf.html");
  const src = fs.readFileSync(FIXTURE, "latin1");
  const marker = "<TD>50.148</TD>";   // Nils's run 1; Nils has the two DNFs
  assert.ok(src.includes(marker), "fixture shape changed; update this test");
  fs.writeFileSync(bad, src.replace(marker, "<TD>55.148</TD>"), "latin1");

  const { status, all } = run([bad, "--class", "MR"]);
  assert.notEqual(status, 0);
  assert.match(all, /did not reconcile/);
  assert.match(all, /runs sum to .* but the sheet says/);
});

test("names the event type when a sheet has no cumulative total at all", () => {
  // Autocross and track rank on best lap and carry no total, so every driver
  // fails to balance. That is a different fact from corrupt data and the script
  // has to say which, or the next person debugs a working parser.
  const auto = path.join(path.dirname(tmpOut()), "autocross.html");
  const runs = ["43.351", "43.448", "44.315", "42.978", "44.203"]
    .map((t) => `<TD>${t}</TD>`).join("");
  fs.writeFileSync(auto, `<html><body>
<TD><b>Class standings for AS [2 Cars]</b></TD>
<TABLE><TR><TD>T</TD><TD>1</TD><TD>7</TD><TD>Sam Carter</TD><TD>2009 Honda Fit</TD></TR>
<TR><TD></TD><TD></TD><TD></TD>${runs}</TR>
<TR><TD>T</TD><TD>2</TD><TD>9</TD><TD>Jo Nakamura</TD><TD>2009 Honda Fit</TD></TR>
<TR><TD></TD><TD></TD><TD></TD>${runs}</TR>
</TABLE></body></html>`, "latin1");

  const { status, all } = run([auto, "--class", "AS"]);
  assert.notEqual(status, 0);
  assert.match(all, /not a rallycross sheet/);
  assert.match(all, /best lap/, "should say why, not just that it failed");
  assert.doesNotMatch(all, /parse is wrong/, "this is unsupported, not corrupt");
});

test("an unknown class fails and names the classes that exist", () => {
  const { status, all } = run([FIXTURE, "--class", "ZZ"]);
  assert.notEqual(status, 0);
  assert.match(all, /class ZZ not found/);
  assert.match(all, /MR \[5 Cars\]/, "should list what is actually on the page");
});

test("--roster overrides the car label the sheet supplies", () => {
  const dir = path.dirname(tmpOut());
  const roster = path.join(dir, "roster.json");
  fs.writeFileSync(roster, JSON.stringify({ Dana: "90 MIATA - RED BOMBER" }));
  const out = path.join(dir, "rostered.json");

  const { status, output } = run(
    [FIXTURE, "--class", "MR", "--roster", roster, "--out", out], { readOut: out });

  assert.equal(status, 0);
  const r = byName(output);
  assert.equal(r.Dana.car, "90 MIATA - RED BOMBER", "roster wins");
  assert.equal(r.Priya.car, "91 NISSAN 240SX", "un-rostered drivers keep the sheet's label");
});

test("writes nothing without --out", () => {
  const { status, stdout } = run([FIXTURE, "--class", "MR"]);
  assert.equal(status, 0);
  assert.match(stdout, /nothing written/);
});
