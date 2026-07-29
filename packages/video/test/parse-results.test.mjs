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
  const r = byName(golden);
  // Marco's run 2 is 47.611 WITH one cone, not 47.611 plus one.
  assert.equal(r.Marco.runs[1], 47.611);
  assert.equal(r.Marco.cones[1], 1);
  // and the credited runs sum to the credited total
  const sum = +r.Marco.runs.reduce((a, b) => a + b, 0).toFixed(3);
  assert.equal(sum, r.Marco.total);
});

test("cone counts come off the (n) suffix, including double digits", () => {
  const r = byName(golden);
  assert.equal(r.Dana.cones.reduce((a, b) => a + b, 0), 0);
  assert.equal(r.Marco.cones.reduce((a, b) => a + b, 0), 2);
  // Nils picks up 11, which is what drives the badge's "!" overflow
  assert.equal(r.Nils.cones.reduce((a, b) => a + b, 0), 11);
});

test("DNFs score as slowest in class for that run plus ten", () => {
  const r = byName(golden);
  for (const run of [7, 8]) {
    const finished = Object.values(r).map((x) => x.runs[run]).filter((t) => t !== r.Nils.runs[run]);
    assert.equal(r.Nils.runs[run], +(Math.max(...finished) + 10).toFixed(3),
      `run ${run + 1} should be slowest + 10`);
  }
  assert.equal(r.Nils.cones[7], 0, "a DNF carries no cone count of its own");
});

test("standings and margin survive the round trip", () => {
  const sorted = [...golden.racers].sort((a, b) => a.total - b.total);
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

// The two cases below reach the FINAL reconciliation block, which the
// corrupted-total case above does not: a broken total defeats the
// total-finding step first, so it exits earlier. Without these, the whole
// end-of-run verification could be deleted and every other test still passed —
// confirmed by mutation.
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
