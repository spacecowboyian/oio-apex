/**
 * Measure a fisheye lens's true angular coverage.
 *
 * Why this exists: the X4 is widely assumed to be 190 degrees per lens. It is
 * not — this method reports ~202 for the X4, though 187/175 judged better by eye
 * enough that it reads as "faces look stretched" no matter what you do to the
 * output projection.
 *
 * Method: a distant treeline or horizon is straight in the world. Rectilinear
 * output maps straight lines to straight lines ONLY when the input model is
 * right, so render the horizon well off-centre and sweep ih_fov; the value
 * where its curvature crosses zero is the real coverage.
 *
 * Fit a quadratic and use its sagitta, not max deviation or RMS — real
 * treelines are ragged, so those are dominated by scene noise while the
 * quadratic term isolates the lens.
 */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runOk } from "./util.mjs";
import { lensSources } from "./frames.mjs";

const W = 1600;
const H = 900;

async function readRgbFile(file) {
  const buf = await readFile(file);
  return new Uint8Array(buf);
}

/**
 * Row of the sky/ground boundary per column.
 * Sky is both blue and bright; the first row that is neither is the horizon.
 */
function horizonRows(rgb, x0, x1) {
  const rows = [];
  for (let x = x0; x < x1; x++) {
    let found = NaN;
    for (let y = Math.round(H * 0.22); y < H; y++) {
      const i = (y * W + x) * 3;
      const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
      const lum = (r + g + b) / 3;
      if (!(b > 120 && lum > 100)) { found = y; break; }
    }
    rows.push(found);
  }
  return rows;
}

/** Sagitta of a least-squares quadratic across the sampled span, in pixels. */
function bow(rows, x0) {
  const xs = [], ys = [];
  rows.forEach((y, i) => { if (Number.isFinite(y)) { xs.push(x0 + i); ys.push(y); } });
  if (xs.length < 200) return null;
  const n = xs.length;
  let Sx = 0, Sx2 = 0, Sx3 = 0, Sx4 = 0, Sy = 0, Sxy = 0, Sx2y = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i], x2 = x * x;
    Sx += x; Sx2 += x2; Sx3 += x2 * x; Sx4 += x2 * x2;
    Sy += y; Sxy += x * y; Sx2y += x2 * y;
  }
  // solve the 3x3 normal equations for the quadratic coefficient
  const m = [[Sx4, Sx3, Sx2], [Sx3, Sx2, Sx], [Sx2, Sx, n]];
  const v = [Sx2y, Sxy, Sy];
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r2 = c + 1; r2 < 3; r2++) if (Math.abs(m[r2][c]) > Math.abs(m[p][c])) p = r2;
    [m[c], m[p]] = [m[p], m[c]]; [v[c], v[p]] = [v[p], v[c]];
    if (!m[c][c]) return null;
    for (let r2 = c + 1; r2 < 3; r2++) {
      const f = m[r2][c] / m[c][c];
      for (let k = c; k < 3; k++) m[r2][k] -= f * m[c][k];
      v[r2] -= f * v[c];
    }
  }
  let a = v[0] / m[0][0];
  const span = xs[xs.length - 1] - xs[0];
  return (a * span * span) / 4;
}

export async function calibrate(clip, { pitch = 35, from = 180, to = 210 } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "360calib-"));
  // the forward lens, wherever this body keeps it
  const src = await lensSources(clip);
  const x0 = Math.round(W * 0.08), x1 = Math.round(W * 0.56);

  console.log(`Sweeping ih_fov ${from}..${to} against the horizon in ${path.basename(clip)}`);
  console.log(`(rectilinear output, pitch ${pitch}; bow 0 = straight horizon)\n`);

  const results = [];
  for (let f = from; f <= to; f += 2) {
    const raw = path.join(dir, `f${f}.rgb`);
    await runOk("ffmpeg", [
      "-v", "error", ...src.inputs.flatMap((v) => ["-ss", "20", "-i", v]), "-map", src.lens0, "-frames:v", "1",
      "-vf",
      `v360=input=equisolid:ih_fov=${f}:iv_fov=${f}:output=flat:h_fov=120:v_fov=78:` +
        `yaw=0:pitch=${pitch}:roll=180:w=${W}:h=${H}`,
      "-f", "rawvideo", "-pix_fmt", "rgb24", raw, "-y",
    ]);
    const b = bow(horizonRows(await readRgbFile(raw), x0, x1), x0);
    if (b === null) {
      console.log(`  ih_fov ${f}   (no usable horizon in the sampled span)`);
      continue;
    }
    results.push({ f, bow: b });
    console.log(`  ih_fov ${String(f).padStart(3)}   bow ${b >= 0 ? "+" : ""}${b.toFixed(2)} px`);
  }

  if (!results.length) {
    console.log("\nNo horizon found. Try --pitch to put a distant skyline off-centre.");
    return null;
  }
  const best = results.reduce((a, b) => (Math.abs(b.bow) < Math.abs(a.bow) ? b : a));
  console.log(`\n  straightest: ih_fov ${best.f} (bow ${best.bow.toFixed(2)} px)`);
  console.log("  put that in aim.json as lens.ih_fov");
  return best.f;
}
