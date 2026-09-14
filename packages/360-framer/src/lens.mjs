import { readFileSync } from "node:fs";

/**
 * Projection maths for dual-fisheye reframing.
 *
 * Two things in here were learned the hard way and are the reason this module
 * exists rather than the numbers being inlined at each call site:
 *
 * 1. The two bodies do not share glass, so the fields are DATA - see
 *    `cameras.json`, which also records which of its numbers are measured and
 *    which are a look. The X1 is 190/190; the X4 ships 194/181, a deliberate
 *    vertical squeeze over a physical field nearer 196.5.
 *
 * 2. v_fov does NOT scale linearly with h_fov. `v = h * 9/16` is wrong and
 *    silently anamorphic — it squeezes ~8% of vertical out of the frame, which
 *    reads as "everyone looks stretched". Solve it through the projection's own
 *    radius function instead; that is what `vFov` does.
 */

/**
 * Per-lens angular coverage, degrees. Measured, not from a spec sheet.
 *
 * **Both axes must exceed 180, and on a round lens they should be equal.** Two
 * lenses at exactly 180 meet with zero overlap; anything less leaves a band of
 * sphere that neither one saw, which renders as a black wedge no amount of
 * blending can fill. An earlier 187/175 pair here did exactly that - 175
 * vertical is 5 degrees short of even touching - and the wedge was mistaken
 * for a stitching artefact for a while before it was recognised as the
 * calibration being impossible.
 *
 * 190 was measured by mapping both lenses into one equirectangular frame and
 * sweeping the FOV for the value where they best AGREE in their overlap band.
 * Scored on Sobel gradients rather than brightness (one lens is often pointed
 * into the sun and the exposures diverge) and on exterior frames rather than
 * interior ones (an interior puts the entire overlap band centimetres from the
 * glass, where parallax between two physically separated lenses swamps any FOV
 * error). Clean unimodal peak at 190 across two independent moments; no
 * mechanical yaw/pitch offset between the lenses was detectable.
 *
 * They stay two separate constants because splitting them is USEFUL, not
 * because the glass is elliptical - it is round to within 0.1%. An unequal pair
 * is an anamorphic squeeze, which is a look worth having (the X4 ships one), so
 * split them on purpose and record in `cameras.json` that that is what it is.
 * Splitting them by accident, believing it a measurement, is how 187/175 got
 * saved and rendered a black wedge for a week.
 */
export const IH_FOV = 190;
export const IV_FOV = 190;

/**
 * Per-body lens profiles, from `cameras.json`.
 *
 * Two cameras are in use and they do NOT share glass, so the calibration is
 * data rather than a constant: a third body should need an entry, not a patch.
 * The constants above stay as the fallback for callers that have no file to
 * look at.
 */
const CAMERAS = JSON.parse(
  readFileSync(new URL("../cameras.json", import.meta.url), "utf8"),
).cameras;

export function cameraList() {
  return Object.entries(CAMERAS).map(([id, c]) => ({ id, ...c }));
}

/**
 * Which body shot this, from how it stores its lenses and how big they are -
 * not from the filename, which says nothing reliable. `id` forces a choice.
 *
 * @returns {{id, label, model, ihFov, ivFov, circle, confidence, notes, matched}}
 */
export function resolveCamera({ layout, frame, id } = {}) {
  let key = id && CAMERAS[id] ? id : null;
  let matched = !!key;
  if (!key) {
    key = Object.keys(CAMERAS).find((k) => {
      const m = CAMERAS[k].match ?? {};
      return (m.layout == null || m.layout === layout) && (m.frame == null || m.frame === frame);
    });
    matched = !!key;
  }
  const c = key ? CAMERAS[key] : null;
  return {
    id: key ?? "unknown",
    label: c?.label ?? "unrecognised body",
    model: c?.model ?? LENS_MODEL,
    ihFov: c?.ih_fov ?? IH_FOV,
    ivFov: c?.iv_fov ?? IV_FOV,
    circle: c?.circle ?? 1.0,
    // The body's default grain reduction. Named explicitly rather than spread
    // from the file: this object is the contract every caller reads, and a
    // field that exists in cameras.json but not here is a setting that looks
    // configured and silently does nothing.
    denoise: c?.denoise ?? DENOISE_DEFAULTS,
    confidence: c?.confidence ?? "fallback",
    notes: c?.notes ?? "",
    matched,
  };
}

/** v360 input model that matches the X4's glass. */
export const LENS_MODEL = "equisolid";

/**
 * Reject a calibration that cannot physically cover the sphere.
 *
 * Two lenses meet only if each reaches past 90 degrees off its own axis, i.e.
 * if both fields exceed 180. Below that there is a band neither lens saw, and
 * every `dual` shot crossing it renders a black wedge that looks exactly like
 * a stitching bug - which is how a stored 187/175 went unnoticed for a while,
 * being blamed on the blend rather than on the numbers. A config is data, and
 * this one is checkable, so check it instead of rendering something wrong.
 *
 * Returns the values to actually use, plus a note when they had to change.
 */
export function checkLens({ ihFov = IH_FOV, ivFov = IV_FOV, camera = null } = {}) {
  const bad = [];
  if (!(ihFov > 180)) bad.push(`ih_fov ${ihFov}`);
  if (!(ivFov > 180)) bad.push(`iv_fov ${ivFov}`);
  if (!bad.length) return { ihFov, ivFov, note: null };
  // Fall back to THIS body's profile when one is known. Falling back to the
  // module constants would hand an X4 the X1's 190/190 while announcing them as
  // "measured" - a rejected setting is confusing enough without the correction
  // also being wrong.
  const fb = { ih: camera?.ihFov ?? IH_FOV, iv: camera?.ivFov ?? IV_FOV };
  return {
    ihFov: fb.ih,
    ivFov: fb.iv,
    note:
      `${bad.join(" and ")} cannot cover the sphere (needs > 180 per lens), so every ` +
      `seam-crossing shot would render a black wedge. Using ` +
      `${camera ? `${camera.label}'s ` : "the fallback "}${fb.ih}/${fb.iv} instead - ` +
      `re-save the aim to make this permanent.`,
  };
}

/**
 * v360 defaults to bilinear. Sharper costs nothing render-time-wise that
 * matters here, and the dual path already pays for two full-res passes, so
 * there is no reason not to spend a little more on each of them.
 */
export const DEFAULT_INTERP = "lanczos";

/**
 * How wide a seam blend to feather, as a fraction of output width. Applied to
 * `gblur`'s pixel sigma, so it scales with render size rather than looking
 * wider on a 1080p preview than on the 4K master of the same shot.
 */
export const SEAM_FEATHER_FRACTION = 1 / 89;

/**
 * Radius of the image circle at a given full field, per projection, in the
 * normalisation v360 uses. r(fov) is the half-frame extent.
 */
const R = {
  sg: (fov) => 2 * Math.tan((fov * Math.PI) / 180 / 4), // stereographic
  flat: (fov) => Math.tan((fov * Math.PI) / 180 / 2), // rectilinear
  pannini: (fov) => 2 * Math.tan((fov * Math.PI) / 180 / 4),
};

const R_INV = {
  sg: (r) => (4 * Math.atan(r / 2) * 180) / Math.PI,
  flat: (r) => (2 * Math.atan(r) * 180) / Math.PI,
  pannini: (r) => (4 * Math.atan(r / 2) * 180) / Math.PI,
};

/**
 * Angle off the view axis, in radians, for a point at normalised radius r.
 * Half of R_INV's full field - the inverse of R, per projection.
 */
const THETA = {
  sg: (r) => 2 * Math.atan(r / 2),
  flat: (r) => Math.atan(r),
  pannini: (r) => 2 * Math.atan(r / 2),
};

/**
 * Output projections the whole pipeline agrees on.
 *
 * `sg` is conformal: it keeps faces and helmets in proportion and gently bows
 * very long straight lines. `flat` is rectilinear: straight lines stay
 * straight - the "less fisheye" look - at the cost of stretching hard toward
 * the corners, which gets ugly past about 120 degrees.
 *
 * Deliberately not offering `pannini` yet: v360 has one, but the R/R_INV pair
 * above is a copy of `sg`, so the preview would draw one thing and the render
 * another. Measure it before exposing it.
 */
export const PROJECTIONS = ["sg", "flat"];

/**
 * The vertical field that actually matches the output aspect.
 * Never compute this by scaling h_fov by the aspect ratio.
 */
export function vFov(hFov, width = 3840, height = 2160, projection = "sg") {
  const fwd = R[projection] ?? R.sg;
  const inv = R_INV[projection] ?? R_INV.sg;
  return inv(fwd(hFov) * (height / width));
}

/** Degrees -> radians. */
const rad = (d) => (d * Math.PI) / 180;

/**
 * Direction a given normalised frame position looks, after the view rotation.
 * Mirrors the shader so the preview and the render agree.
 *
 * @param px  -1..1 across the frame
 * @param py  -1/aspect..1/aspect down the frame
 */
function ray(px, py, { hFov, yaw, pitch, roll, projection = "sg" }) {
  const fwd = R[projection] ?? R.sg;
  const inv = THETA[projection] ?? THETA.sg;
  const r = Math.hypot(px, py) * fwd(hFov);
  const theta = inv(r);
  const phi = Math.atan2(py, px);
  let x = Math.sin(theta) * Math.cos(phi);
  let y = Math.sin(theta) * Math.sin(phi);
  let z = Math.cos(theta);

  const cr = Math.cos(rad(roll)), sr = Math.sin(rad(roll));
  [x, y] = [x * cr - y * sr, x * sr + y * cr];

  const cp = Math.cos(rad(pitch)), sp = Math.sin(rad(pitch));
  [y, z] = [y * cp - z * sp, y * sp + z * cp];

  const cy = Math.cos(rad(yaw)), sy = Math.sin(rad(yaw));
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];

  return { x, y, z };
}

/**
 * Which lens (or both) a framing needs.
 *
 * Matters because a single-lens render is a plain `-map`, while crossing the
 * seam needs the two streams stacked and stitched — and the seam is a blend,
 * not a true stitch, so close subjects show parallax there.
 *
 * @returns {{dual: boolean, lens: "lens0"|"lens1"|null, source: string}}
 */
export function coverage(
  { hFov, yaw, pitch, roll },
  aspect = 16 / 9,
  { ihFov = IH_FOV, ivFov = IV_FOV, projection = "sg" } = {},
) {
  // the tighter axis decides: that is the one a corner falls out of first
  const half = rad(Math.min(ihFov, ivFov) / 2);
  let maxBack = 0;
  let maxFront = 0;
  for (const [px, py] of [[-1, -1 / aspect], [1, -1 / aspect], [-1, 1 / aspect], [1, 1 / aspect]]) {
    const d = ray(px, py, { hFov, yaw, pitch, roll, projection });
    const thetaBack = Math.acos(Math.max(-1, Math.min(1, d.z)));
    maxBack = Math.max(maxBack, thetaBack);
    maxFront = Math.max(maxFront, Math.PI - thetaBack);
  }
  if (maxBack <= half) return { dual: false, lens: "lens1", source: "lens1" };
  if (maxFront <= half) return { dual: false, lens: "lens0", source: "lens0" };
  return { dual: true, lens: null, source: "dual" };
}

/** Fold an angle into -180..180 so a rotated yaw stays readable in the graph. */
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * Build the v360 filter string for one shot.
 * v_fov is always recomputed from the real output size — a stale or
 * hand-written v_fov in a config is corrected rather than trusted.
 *
 * A `lens0` shot is also rotated 180 degrees in yaw. Aim angles are expressed
 * in the rear lens's frame (the one the aimer's preview treats as forward),
 * and the front stream's optical axis points the opposite way — so rendering
 * `0:v:0` at the stored yaw aims out the back of that lens's coverage and
 * produces a **black frame**, with no error from ffmpeg. Both rotations are
 * about the same Y axis, so they compose into yaw alone; pitch and roll carry
 * over untouched. `filterGraph` reuses this per-lens for `dual` shots too
 * (with `source` forced to `lens0`/`lens1` in turn), so the flip only ever
 * has to be right in one place.
 */
export function v360Filter(shot, {
  width, height, projection = "sg",
  ihFov = IH_FOV, ivFov = IV_FOV, model = LENS_MODEL,
  interp = DEFAULT_INTERP, alphaMask = false, equirect = false,
}) {
  const dual = shot.source === "dual";
  const v = vFov(shot.h_fov, width, height, projection);
  // AN EQUIRECT AIM IS NOT A FISHEYE AIM, and a shot cannot be moved between
  // them. Measured: rendering the same shot both ways scored 0.04 normalised
  // cross-correlation - not a near miss, a different direction entirely.
  //
  // The reason is that Studio's export is horizon-levelled. The raw fisheye
  // sphere carries however the camera was actually bolted on (on Fergus, roll
  // -105.5 and pitch -25.9); a levelled equirect has had exactly that taken
  // out, so it arrives upright. A fisheye aim ENCODES the mount tilt, and
  // applying it to an already-levelled sphere tilts it a second time.
  //
  // So an equirect shot wants roll near 0 and a small pitch, with yaw doing the
  // work - which is also why re-aiming on the equirect is quick rather than a
  // chore. The lens0 +180 flip below still applies either way: it is about
  // which half of the sphere the shot looks into, not about the mount.
  const yaw = shot.source === "lens0" ? wrap180((shot.yaw ?? 0) + 180) : (shot.yaw ?? 0);
  const n = (x) => Number(x).toFixed(1).replace(/\.0$/, "");
  const parts = [
    // `e` is a whole sphere already: it has no ih_fov/iv_fov, because those
    // describe glass and this frame left the glass behind in Studio. Passing
    // them anyway makes v360 reinterpret the input and the result is subtly,
    // unhelpfully wrong rather than an error.
    `v360=input=${equirect ? "e" : dual ? "dfisheye" : model}`,
    ...(equirect ? [] : [`ih_fov=${n(ihFov)}`, `iv_fov=${n(ivFov)}`]),
    `output=${projection}`,
    `h_fov=${n(shot.h_fov)}`,
    `v_fov=${n(v)}`,
    // v360's yaw runs opposite to the aimer's. Established by feeding ffmpeg
    // the *exact* JPEG the preview samples and scoring every combination of
    // rotation order, per-axis sign and input flip against the preview's own
    // canvas: this one scores 0.997 normalised cross-correlation and the
    // runner-up 0.76, so it is not a close call. rorder stays at ffmpeg's
    // default "ypr" - it already matches. Do not "verify" this by
    // reimplementing the shader's matrices in another language and comparing
    // to that; that was tried, the reimplementation was itself wrong, and it
    // confidently produced a different (wrong) answer. Compare rendered
    // pixels to rendered pixels.
    `yaw=${n(-yaw)}`,
    `pitch=${n(shot.pitch ?? 0)}`,
    `roll=${n(shot.roll ?? 0)}`,
    `w=${width}`,
    `h=${height}`,
  ];
  if (interp) parts.push(`interp=${interp}`);
  if (alphaMask) parts.push("alpha_mask=1");
  return parts.join(":");
}

/**
 * A fisheye frame is a CIRCLE inside a square; the corners are dead.
 *
 * `alpha_mask=1` marks the whole rectangular source frame as covered, corners
 * included, so a lens composited through it paints its own black corners over
 * the other lens's perfectly good pixels. On a real seam-crossing shot that
 * was 9.5% of the frame turned black - a wedge that reads exactly like a
 * stitching failure, and got blamed on the blend, then on the field of view,
 * before it turned out to be the mask.
 *
 * So the mask is built here instead, on the source, before any warping:
 * alpha = 1 inside the image circle, 0 outside, with a soft edge. `v360`
 * resamples that alpha along with the colour (verified - it passes input alpha
 * through), which means the mask lands in output space already warped to match
 * its own lens, and the feather comes along for free instead of needing a
 * separate blur pass.
 *
 * The radius comes from the calibration rather than being assumed: the circle
 * meets the frame edge at `ih_fov`, so anything past `w/2` is outside the
 * glass. `EDGE` pulls in slightly off the very rim, where fisheye lenses go
 * soft and dark and are not worth blending in.
 */
const MASK_EDGE = 0.985;      // ignore the last 1.5% of the rim
const MASK_FEATHER = 0.04;    // fraction of radius to fade over

/**
 * `geq` expression for the image-circle mask, as a luminance plane.
 *
 * ROUND, always - and deliberately not a function of the fields.
 *
 * This used to normalise each axis by its own field, making the mask an ellipse
 * whenever ih and iv differed. That conflates two different things. The mask
 * answers "where did the glass put light on this sensor", and that region is a
 * circle: measured off real X4 frames it is round to within 0.1% (sigma x/y =
 * 1.0004). The fields answer "what angle does a given pixel look at", which is
 * v360's job and has no bearing on the shape of the lit area.
 *
 * Getting that wrong cost real picture. At ih 194 / iv 181 the ellipse trimmed
 * the top and bottom off each lens circle, and since the seam of an in-cabin
 * shot runs right through there, the two lenses stopped overlapping: 49 pixels
 * of overlap band and 663 pixels that NEITHER lens covered, in a strip along
 * the top of frame. Round, at the same fields, gives 3464 pixels of overlap and
 * zero uncovered - 70x more for the feather to work with. It only ever bit when
 * the two fields differed, which is why it survived until they did.
 */
export function circleMaskExpr(circle = 1.0) {
  const r = `(min(W,H)/2*${(MASK_EDGE * circle).toFixed(4)})`;
  const d = `hypot(X-W/2,Y-H/2)`;
  return `clip(255*(1-(${d}-${r}*${1 - MASK_FEATHER})/(${r}*${MASK_FEATHER})),0,255)`;
}

/**
 * ffmpeg args that write the mask once, to a file, at the lens frame's size.
 * `geq` is evaluated per pixel per frame, so on a 2880x2880 source it costs
 * more than the reprojection it feeds - about 6x the whole render. Building it
 * once and handing it in as an input instead takes a 150s dual shot from ~50
 * minutes to ~9, and the mask is a constant, so nothing is lost by it.
 */
export function maskBuildArgs({ width, height, circle = 1.0, dst }) {
  return [
    "-v", "error",
    "-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:d=1`,
    "-vf", `format=gray,geq=lum='${circleMaskExpr(circle)}'`,
    "-frames:v", "1", dst, "-y",
  ];
}

/**
 * Shadow lift, per shot.
 *
 * The interior shots come out of this camera with half the frame under 0.15
 * and a tenth of it at effectively black - the seat, the footwell, the lower
 * dash - while the highlights are no worse than an iPhone's. So there is room
 * to open the bottom without touching the top, which is what this does:
 *
 *     out = x ^ (1 / (1 + k(1-x)^2))
 *
 * The exponent is itself a function of the input, so the lift is strong at the
 * bottom and fades to nothing by the top: 0 and 1 are both fixed points, and
 * at k=1 a 0.08 shadow opens to 0.25 while a 0.80 highlight moves to 0.81.
 *
 * It is deliberately ONE closed-form expression rather than a spline through
 * control points, because the preview shader has to compute the identical
 * curve and reproducing ffmpeg's spline in GLSL is exactly the kind of
 * near-miss that has drifted preview from render repeatedly here.
 *
 * Per shot, not per camera: the interior needs it and the hood-forward shot
 * would go flat with it, so it lives on the shot next to yaw and pitch.
 */
export function shadowLift(k) {
  const K = Number(k) || 0;
  if (K <= 0) return null;
  const n = K.toFixed(3);
  const e = `pow(val/255,1/(1+${n}*pow(1-val/255,2)))*255`;
  // lutrgb wants RGB, and per-channel keeps neutrals neutral (r=g=b in, r=g=b
  // out) - the same thing the shader does, rather than lifting luma alone.
  return `format=gbrp,lutrgb=r='${e}':g='${e}':b='${e}'`;
}

/**
 * Per-shot colour correction, in the same pass as the warp.
 *
 * Every control here is a closed-form per-pixel function, chosen on exactly
 * that criterion: the preview shader has to compute the identical thing, and
 * anything needing a spline, a histogram or a neighbourhood would drift.
 *
 * Order is fixed and matters - exposure and white balance act on the raw
 * value, tone shapes it, and saturation goes last so it works on the graded
 * colour rather than the ungraded one:
 *
 *   exposure -> white balance -> shadow lift -> highlight rolloff -> contrast
 *   -> saturation
 *
 * The first five are per-channel scalars, so they fold into ONE `lutrgb`.
 * Saturation is the only cross-channel step and is a plain 3x3, so it is a
 * `colorchannelmixer`. Both are exact - no interpolation, no 3D LUT rounding,
 * so preview and render agree to the bit rather than to a tolerance.
 *
 * CONTRAST pivots on a FIXED 0.5, not on the frame's own median. A median
 * pivot tracks content, which means it moves shot to shot AND frame to frame -
 * the picture would breathe as the median wandered, and the preview (one still)
 * could never agree with the render (every frame). The curve is a smoothstep
 * blend, which has zero slope at both ends, so adding punch can never crush
 * black to zero or clip white.
 */
export const COLOUR_DEFAULTS = {
  exposure: 0, temperature: 0, tint: 0,
  shadow: 0, highlight: 0, contrast: 0, saturation: 1,
};

/** True when a colour block would do nothing, so the filter can be skipped. */
export function colourIsIdentity(c = {}) {
  const v = { ...COLOUR_DEFAULTS, ...c };
  return v.exposure === 0 && v.temperature === 0 && v.tint === 0 &&
         v.shadow === 0 && v.highlight === 0 && v.contrast === 0 && v.saturation === 1;
}

/**
 * Grain reduction, applied AFTER the warp and BEFORE the colour block.
 *
 * The order is the whole point. What reads as grain on this footage is mostly
 * CHROMA speckle - coloured confetti in flat areas - and `shadow` and
 * `contrast` multiply it. Graded first and denoised after, the filter is
 * chasing noise the grade already amplified; denoised first, it never gets
 * amplified. Same reasoning that puts the LUT after the tone sliders, running
 * the other way.
 *
 * TWO AXES, and they are not equally priced. Measured on a real X4 exterior
 * frame, anchored on the car's own painted hood - a smooth surface, so every
 * bit of high-frequency detail there is noise, where tarmac's aggregate
 * texture is real detail and cannot tell the two apart (the first metric tried
 * used tarmac and scored every technique within 4% of doing nothing):
 *
 *   chroma-only 0/10   noise -8%   edge detail +2%   chroma speckle -39%
 *   chroma + bm3d      noise -15%  edge detail -3%   chroma speckle -40%
 *   fftdnoiz sigma 3   noise -18%  edge detail -14%
 *   vaguedenoiser 3    noise -20%  edge detail -16%
 *   nlmeans s=3        noise -27%  edge detail -22%
 *
 * So chroma is nearly free and luma is not: everything that touches luma pays
 * about one unit of real detail per 1.2 units of noise. Hence `chroma` carries
 * the per-body default and `luma` defaults to 0 - opt in per shot, knowing the
 * cost.
 *
 * `hqdn3d` rather than anything cleverer, and that is a throughput decision:
 * it runs at realtime on a 4K stream, where bm3d measured ~4 hours per
 * 115-second shot and nlmeans worse. bm3d earns its place on a hero shot
 * (best ratio in the table above, 5:1 after the chroma pass) but not on a
 * batch, so it is reachable through `extra` rather than being a default that
 * quietly turns an afternoon into overnight.
 *
 * TWO THINGS THAT DO NOT WORK, both measured rather than assumed:
 *
 * - `atadenoise` made it WORSE on both counts (+8% noise, +10% detail, which
 *   is just sharpening). It is a temporal filter and it wants still pixels;
 *   nothing in a camera bolted to a moving car holds still.
 * - Sharpening afterwards to "put the detail back" re-adds noise faster than
 *   detail: `cas=0.4` after bm3d scored +34% noise for +21% detail. The
 *   detail it returns is largely the grain you just paid to remove.
 *
 * NOT MIRRORED IN THE PREVIEW, deliberately, and this is the one place the
 * aimer's preview and the render are allowed to differ. Every colour control
 * exists in closed form precisely so the shader can compute the identical
 * thing per pixel; a denoiser reads a neighbourhood (and, temporally, other
 * frames), so no shader can honestly match it. The choice is between a
 * preview that lies and a preview that says it is not showing this - and the
 * second is the one that keeps the first rule intact. `render` prints what it
 * applied, and **Render frame** in the aimer goes through the real pipeline,
 * so the honest preview of a denoise is that button.
 */
export const DENOISE_DEFAULTS = { luma: 0, chroma: 0, extra: null };

/** True when a denoise block would do nothing, so the filter can be skipped. */
export function denoiseIsIdentity(d = {}) {
  if (d && d.enabled === false) return true;
  const v = { ...DENOISE_DEFAULTS, ...d };
  return !(v.luma > 0) && !(v.chroma > 0) && !v.extra;
}

/**
 * Filters implementing a denoise block. Returns [] when it is a no-op.
 *
 * hqdn3d takes four strengths - luma spatial, chroma spatial, luma temporal,
 * chroma temporal. The temporal pair is derived at 1.2x its spatial partner
 * rather than exposed: the two are not independent in practice, and the
 * measured setting that this is fitted to (0:10:0:12) sits on that line. One
 * number per axis is a control someone can reason about; four is a filter
 * string with extra steps.
 */
export function denoiseChain(denoise = {}) {
  const d = { ...DENOISE_DEFAULTS, ...denoise };
  if (denoiseIsIdentity(d)) return [];
  const out = [];
  const ls = Math.max(0, Number(d.luma) || 0);
  const cs = Math.max(0, Number(d.chroma) || 0);
  if (ls > 0 || cs > 0) {
    const n = (v) => Number(v.toFixed(2));
    out.push(`hqdn3d=${n(ls)}:${n(cs)}:${n(ls * 1.2)}:${n(cs * 1.2)}`);
  }
  // An escape hatch for the slow, better denoisers on a shot that is worth
  // the wall clock. Passed through verbatim, so it is the author's problem if
  // it does not parse - the alternative is wrapping every filter ffmpeg has.
  if (d.extra) out.push(String(d.extra));
  return out;
}

/**
 * The denoise a shot actually gets: its own block, else the body's default.
 *
 * Per body because the speckle is a property of the sensor and its bitrate,
 * not of any one shot - the same reasoning that puts the audio treatment on
 * by default rather than behind a flag someone has to remember. A shot that
 * wants none says `{"enabled": false}` rather than having to know the number.
 */
export function resolveDenoise(shot = {}, camera = null) {
  if (shot.denoise !== undefined && shot.denoise !== null) return shot.denoise;
  return camera?.denoise ?? DENOISE_DEFAULTS;
}

/**
 * Per-body settings that put our output on the same footing as an iPhone.
 *
 * Derived, not styled: fitted against IMG_0245 - the parade-lap clip, Ryan
 * driving the MGB, camera inside the car and then upside down on the bodywork.
 * Anchored on shared materials (the near-neutral gravel, and the black point)
 * rather than on whole-frame histograms, which would fit content instead of
 * camera.
 *
 * TWO SETS, and which one a shot takes is decided by its intent, not its body.
 * Fitted on different anchors because the shots are different problems: the
 * exterior set is anchored on the near-neutral gravel and the black point, the
 * interior set on the cabin mass (20th percentile) and what survives through
 * the glass (90th). One set per camera cannot serve both - see `iphoneMatch`.
 *
 * WHICH REFERENCE CLIP IS USED MATTERS ENORMOUSLY, and getting it wrong is not
 * obvious from the numbers. A first pass used IMG_0241, which is slo-mo - a
 * different ISO and shutter, so a different look - and it gave gravel 0.415 /
 * black 0.146 / saturation 0.190 against this clip's 0.548 / 0.101 / 0.305.
 * Fitted to that, the recommendation was to pull exposure down 0.55 stops and
 * leave saturation alone; fitted to this one it is to lift the blacks' contrast
 * hard and push saturation up half again. Opposite advice, equally good
 * residuals. Only normal-rate footage of a comparable subject is a reference.
 *
 * NOT a 3D LUT, and that is the finding. The measured difference is tone plus
 * saturation, with white balance already neutral to within 2% on gravel, and
 * that is exactly what these closed-form controls express - so the preview
 * shader computes the identical thing and no .cube, no WebGL 3D texture and no
 * 2D-atlas workaround is needed.
 */
export const IPHONE_MATCH = {
  exterior: {
    x1: { exposure: -0.14, shadow: -0.8, contrast: 0.3, highlight: 0.2, saturation: 1.53 },
    x4: { exposure: 0.16, shadow: -1.4, contrast: 0.7, highlight: 0, saturation: 1.12 },
  },
  interior: {
    x1: { exposure: 0.18, shadow: 1.0, contrast: 0.45, highlight: 0.4, saturation: 1.01 },
    x4: { exposure: 0.36, shadow: 0.8, contrast: 0.25, highlight: 0.4, saturation: 1.04 },
  },
};

/**
 * Which of the two an intent wants. Anything not listed is treated as exterior.
 *
 * The split is not cosmetic - the two sets pull in OPPOSITE directions on the
 * control that matters most. Exterior wants shadow -0.8 to -1.4 (crush the
 * blacks under a sunlit plain); interior wants +0.8 to +1.0 (open a dark cabin
 * against blown windows). Applying the exterior set to a cabin shot is a swing
 * of up to 1.8 on that one slider, and it collapses the occupants to black.
 */
const INTERIOR_INTENTS = new Set(["driver", "cabin-wide"]);

/**
 * @param camera "x1" | "x4"
 * @param intent an id from shots.json, or null for exterior
 */
export function iphoneMatch(camera, intent = null) {
  const set = INTERIOR_INTENTS.has(intent) ? IPHONE_MATCH.interior : IPHONE_MATCH.exterior;
  return set[camera] ?? null;
}

/** Per-channel white-balance gains. Warm pushes red up and blue down. */
export function wbGains({ temperature = 0, tint = 0 } = {}) {
  const t = temperature / 100, g = tint / 100;
  return [1 + 0.22 * t, 1 + 0.12 * g, 1 - 0.22 * t];
}

/**
 * The per-channel tone expression, as ffmpeg `lutrgb` text.
 * `x` is whatever expression yields 0..1 for this channel.
 */
function toneExpr(x, { exposure = 0, shadow = 0, highlight = 0, contrast = 0 }, gain) {
  const n = (v) => Number(v).toFixed(4);
  // exposure in stops, then this channel's white-balance gain, clamped so the
  // later powers never see a negative or >1 base
  let e = `clip(${x}*${n(Math.pow(2, exposure) * gain)},0,1)`;
  // Shadow: positive lifts, negative CRUSHES. The two are exact inverses -
  // x^(1/(1+k(1-x)^2)) and x^(1+k(1-x)^2) - so one control covers both
  // directions with 0 and 1 fixed either way.
  //
  // The crush exists because matching this footage to an iPhone needs it and
  // nothing else could do the job: the blacks sit ~0.15 too high while the
  // midtone is nearly right, and `contrast` pivots on 0.5 so it drags the
  // midtone down with the shadows. Fitting without a crush left the neutral
  // gravel anchor at 0.420 against a target of 0.504; with it, both anchors
  // land to three decimals.
  if (shadow > 0) e = `pow(${e},1/(1+${n(shadow)}*pow(1-${e},2)))`;
  else if (shadow < 0) e = `pow(${e},1+${n(-shadow)}*pow(1-${e},2))`;
  if (highlight > 0) e = `(1-pow(1-${e},1/(1+${n(highlight)}*pow(${e},2))))`;
  if (contrast > 0) {
    // smoothstep: 3x^2-2x^3. Zero slope at 0 and 1, so it cannot clip.
    e = `(${e}+${n(contrast)}*((3*pow(${e},2)-2*pow(${e},3))-${e}))`;
  } else if (contrast < 0) {
    e = `(${e}+${n(-contrast)}*((0.5+(${e}-0.5)*0.6)-${e}))`;
  }
  return e;
}

/**
 * Filters implementing a colour block. Returns [] when it is a no-op.
 */
export function colourChain(colour = {}) {
  const c = { ...COLOUR_DEFAULTS, ...colour };
  if (colourIsIdentity(c)) return [];
  const out = [];
  const gains = wbGains(c);
  const needsTone = c.exposure !== 0 || c.temperature !== 0 || c.tint !== 0 ||
                    c.shadow > 0 || c.highlight > 0 || c.contrast !== 0;
  if (needsTone) {
    const per = gains.map((g) => `${toneExpr("(val/255)", c, g)}*255`);
    out.push(`format=gbrp,lutrgb=r='${per[0]}':g='${per[1]}':b='${per[2]}'`);
  }
  if (c.saturation !== 1) {
    // luma-preserving saturation as an explicit 3x3, so the shader can do the
    // same arithmetic instead of guessing at eq's internal YUV formula
    const s = c.saturation, L = [0.2126, 0.7152, 0.0722];
    const m = (i, j) => (L[j] * (1 - s) + (i === j ? s : 0)).toFixed(5);
    out.push(
      `colorchannelmixer=` +
      `rr=${m(0,0)}:rg=${m(0,1)}:rb=${m(0,2)}:` +
      `gr=${m(1,0)}:gg=${m(1,1)}:gb=${m(1,2)}:` +
      `br=${m(2,0)}:bg=${m(2,1)}:bb=${m(2,2)}`,
    );
  }
  return out;
}

/**
 * A 3D LUT, applied in the SAME pass as the warp.
 *
 * Not as a second encode: the source is 8-bit 4:2:0 and our warp already costs
 * it one lossy generation, so grading in a separate pass would band for no
 * reason. Graded here, the pixels are still the ones v360 just resampled.
 *
 * `tetrahedral` rather than v360's default trilinear - on a 33-cube it is
 * visibly cleaner through gradients like sky, and costs almost nothing.
 */
function lut3d(file) {
  // ffmpeg splits filter args on ':' and unescapes '\', so a path has to be
  // escaped or a directory name with a colon silently truncates the filter.
  const esc = String(file).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  return `lut3d=file='${esc}':interp=tetrahedral`;
}

/** Self-contained mask chain, for when there is no prebuilt mask to hand in. */
function inlineMask(circle, tag) {
  // `format=yuv444p` on the image branch is load-bearing: `split` cannot hand
  // its two outputs different pixel formats, so without it ffmpeg negotiates
  // the whole thing down to the mask branch's `gray` and the render comes out
  // black and white with no error anywhere. (The prebuilt-mask path does not
  // split the video at all, so it does not need this - and is faster for it.)
  return (
    `split[i${tag}][m${tag}];` +
    `[i${tag}]format=yuv444p[c${tag}];` +
    `[m${tag}]format=gray,geq=lum='${circleMaskExpr(circle)}'[k${tag}];` +
    `[c${tag}][k${tag}]alphamerge`
  );
}

/**
 * The whole filter graph for one shot, so the CLI and the aimer cannot drift
 * apart on the one thing that is easy to get silently wrong.
 *
 * Single lens is one v360 and needs nothing else.
 *
 * Dual used to stack both lenses into one dual-fisheye frame and let v360's
 * `dfisheye` input sample across them. That produced a **hard cut** at the
 * seam — checked directly against v360's own `alpha_mask` output, which steps
 * 0 to 255 with no soft edge at all, because dfisheye has no blending of its
 * own. `dfisheye` also hard-codes an *equidistant* model with no equisolid
 * variant, so it sampled these lenses about 7% too tight.
 *
 * Each lens is now masked to its own image circle (see `circleMask`), warped
 * straight to the output, and composited with `overlay`. The mask is built
 * before the warp so v360 carries it into output space for free, feather and
 * all — no `gblur` pass, and no way for a dead corner to win over live pixels.
 *
 * @returns {{vf: string, stream: string} | {complex: string, label: string}}
 */
export function filterGraph(shot, opts) {
  const {
    ihFov = IH_FOV, ivFov = IV_FOV,
    // Which ffmpeg label carries each lens. Defaults to the X4's two-streams-
    // in-one-file layout; a body that splits its lenses across files passes
    // {lens0: "0:v:0", lens1: "1:v:0"} instead. Resolved by `lensSources`.
    src = { lens0: "0:v:0", lens1: "0:v:1" },
    // Label of a prebuilt mask input (see `maskBuildArgs`). Without one the
    // mask is built inline, which is self-contained but much slower.
    mask = null,
    // Path to a .cube, graded in this same pass. See `lut3d`.
    lut = null,
    // How far the lit image circle reaches, as a fraction of the inscribed
    // radius. Per body, from cameras.json - the X4's is exactly inscribed, the
    // X1 overfills its frame. Only the inline mask needs it; a prebuilt mask
    // has it baked in already.
    circle = 1.0,
    // Grain reduction, resolved by the caller (shot block, else the body's
    // default - see `resolveDenoise`). It runs before the colour block, so
    // the grade never amplifies what it removes.
    denoise = null,
    // The source is a whole stitched sphere (a Studio 8K equirect master)
    // rather than a dual-fisheye pair. One stream, no seam, no mask.
    equirect = false,
  } = opts;

  // `shadow` used to live on the shot directly; it is now one control inside
  // the colour block, and the old field is still honoured so shots saved
  // before that keep rendering the same.
  const colour = { ...(shot.colour ?? {}), ...(shot.shadow != null && shot.colour?.shadow == null ? { shadow: shot.shadow } : {}) };
  // Tone before look: the sliders fix this shot's exposure, the LUT is the
  // camera's colour character, and a look applied to an unopened shadow is
  // grading something that is not there yet.
  // Denoise BEFORE the grade, never after: `shadow` and `contrast` multiply
  // chroma speckle, so cleaning first removes it at its own amplitude rather
  // than at the amplitude the grade gave it.
  const pre = denoiseChain(denoise ?? {}).map((f) => `,${f}`).join("");
  const post = colourChain(colour).map((f) => `,${f}`).join("") + (lut ? `,${lut3d(lut)}` : "");

  // An equirect has no seam to blend and no dead corners to mask: the whole
  // sphere arrives in one stream. So it takes the simple path REGARDLESS of
  // what `source` says - that field describes which lens saw the view, and on
  // a stitched master the question no longer applies. Skipping this and
  // letting a "dual" shot through would build a two-lens graph over a stream
  // that has one, which fails as an ffmpeg label error rather than anything
  // that points at the cause.
  if (equirect) {
    return { stream: src.lens0, vf: v360Filter(shot, { ...opts, equirect: true }) + pre + post };
  }

  if (shot.source !== "dual") {
    return { stream: shot.source === "lens1" ? src.lens1 : src.lens0,
             vf: v360Filter(shot, opts) + pre + post };
  }

  // Both layers are masked the same way; which one is the base only decides
  // who wins in the overlap, and in the overlap they agree.
  const base = v360Filter({ ...shot, source: "lens0" }, opts);
  const top = v360Filter({ ...shot, source: "lens1" }, opts);
  // The trailing format=yuv420p is not cosmetic: overlay hands on an alpha
  // channel, and hevc_videotoolbox refuses to encode one (it dies with a bare
  // "Invalid argument" and writes no packets).
  // Graded after the two lenses are joined, not before: one lut3d instead of
  // two, and both halves of the seam get provably identical treatment. The
  // denoise rides in the same place and for the same reason - one pass over
  // the joined frame, and the seam cannot end up cleaner on one side.
  const tail = `[base][top]overlay=format=auto` + pre + post + `,format=yuv420p[o]`;

  const complex = mask
    // One split of the mask feeds both lenses. The video is never split, so it
    // keeps its own 4:2:0 and no chroma upsample is needed. The mask input is
    // a single frame and is NOT looped: framesync repeats the last frame for
    // as long as the video runs, and because it does reach EOF the graph still
    // terminates - a looped input would never end.
    ? `[${mask}]format=gray,split=2[k0][k1];` +
      `[${src.lens0}][k0]alphamerge,${base}[base];` +
      `[${src.lens1}][k1]alphamerge,${top}[top];` + tail
    : `[${src.lens0}]${inlineMask(circle, "0")},${base}[base];` +
      `[${src.lens1}]${inlineMask(circle, "1")},${top}[top];` + tail;
  return { complex, label: "[o]" };
}
