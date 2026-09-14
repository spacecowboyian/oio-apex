/**
 * Live dewarp preview.
 *
 * The shader is the same projection maths the renderer uses, so the framing on
 * screen is the framing ffmpeg produces. Both lenses are sampled and blended
 * across the seam, so aiming can cross between them without hitting a hole.
 */
const ASPECT = 16 / 9;
const PRESETS = {
  bwd: { yaw: 0, pitch: -41, roll: 180, fov: 122.8 },
  fwd: { yaw: 180, pitch: 35, roll: 180, fov: 120 },
};

/* Only a stand-in until /meta.json answers; the server owns these values. */
const state = { lens: "bwd", yaw: 0, pitch: -41, roll: 180, fov: 122.8, ihFov: 190, ivFov: 190, projection: "sg",
  colour: { exposure: 0, temperature: 0, tint: 0, shadow: 0, highlight: 0, contrast: 0, saturation: 1 } };
let shots = [];
let META = { ih_fov: 190, iv_fov: 190, lens_model: "equisolid", clip: "", aim_path: "aim.json" };
/** Aim to fall back to when Revert is pressed. */
let lastCommitted = { yaw: 0, pitch: -41, roll: 180, fov: 122.8, ihFov: 190, ivFov: 190, lens: "bwd" };

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const canvas = $("gl");
const gl = canvas.getContext("webgl");

if (!gl) {
  stage.innerHTML = '<p style="color:#fff;padding:24px">WebGL unavailable in this browser.</p>';
  throw new Error("no webgl");
}

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexB, uTexF;
uniform float uHFov, uYaw, uPitch, uRoll, uIhFov, uIvFov, uAspect, uMode, uProj;
uniform float uExposure, uTemp, uTint, uShadow, uHighlight, uContrast, uSat;
const float PI = 3.141592653589793;
/* Must match circleMask()'s EDGE and FEATHER in lens.mjs exactly. */
const float MASK_EDGE = 0.985;
const float MASK_FEATHER = 0.04;
float rad(float d){ return d * PI / 180.0; }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,-s, 0.,s,c); }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,s, 0.,1.,0., -s,0.,c); }
mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,-s,0., s,c,0., 0.,0.,1.); }

/* equisolid fisheye: r = 2f*sin(theta/2). Each axis is normalised by its own
   coverage, so an unequal ih/iv stretches the frame's two axes differently
   rather than silently rescaling both together. Both should exceed 180 or the
   two lenses cannot meet - see IH_FOV in lens.mjs. */
vec2 fishUv(float th, float ph, float ihfov, float ivfov){
  float r = sin(th * 0.5);
  float rx = r / sin(rad(ihfov) / 4.0);
  float ry = r / sin(rad(ivfov) / 4.0);
  vec2 uv = vec2(0.5) + 0.5 * vec2(rx * cos(ph), ry * sin(ph));
  uv.y = 1.0 - uv.y;
  return uv;
}

/* Where a direction falls relative to this lens's image CIRCLE: <1 is inside
   the glass, >1 is out past it. The frame is square but the image is a circle
   inscribed in it, and the corners outside that circle are dead black - so the
   circle, not the frame, is what actually bounds a lens.

   This has to agree with circleMask() in lens.mjs, which builds the same
   boundary on the source before warping. EDGE and FEATHER are that function's
   constants; the ramp below is its alpha expression rewritten in normalised
   radius, so the preview feathers over exactly the same band the file will. */
float fishCover(float th, float ph, float ihfov, float ivfov){
  float r = sin(th * 0.5);
  float rx = r / sin(rad(ihfov) / 4.0);
  float ry = r / sin(rad(ivfov) / 4.0);
  return length(vec2(rx * cos(ph), ry * sin(ph)));
}

/* Colour correction. MUST match colourChain() in lens.mjs exactly, in the
   same order: exposure -> white balance -> shadow -> highlight -> contrast
   -> saturation. Every step is closed form for precisely this reason. */
vec3 gradeRgb(vec3 c){
  vec3 wb = vec3(1.0 + 0.22*(uTemp/100.0), 1.0 + 0.12*(uTint/100.0), 1.0 - 0.22*(uTemp/100.0));
  c = clamp(c * pow(2.0, uExposure) * wb, 0.0, 1.0);
  if (uShadow > 0.0)    c = pow(c, 1.0/(1.0 + uShadow*pow(1.0-c, vec3(2.0))));
  else if (uShadow < 0.0) c = pow(c, 1.0 + (-uShadow)*pow(1.0-c, vec3(2.0)));
  if (uHighlight > 0.0) c = 1.0 - pow(1.0-c, 1.0/(1.0 + uHighlight*pow(c, vec3(2.0))));
  if (uContrast > 0.0)  c = c + uContrast*((3.0*c*c - 2.0*c*c*c) - c);
  else if (uContrast < 0.0) c = c + (-uContrast)*((0.5 + (c-0.5)*0.6) - c);
  if (uSat != 1.0) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
  }
  return clamp(c, 0.0, 1.0);
}

/* circleMask's alpha ramp, in normalised radius. */
float lensAlpha(float u){
  return clamp(1.0 - (u - MASK_EDGE * (1.0 - MASK_FEATHER)) / (MASK_EDGE * MASK_FEATHER), 0.0, 1.0);
}

void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  p.y /= uAspect;
  /* screen radius -> angle off the view axis, per output projection.
     uProj 0 = sg (stereographic, conformal, gently bows long straight lines)
     uProj 1 = flat (rectilinear, straight lines stay straight, stretches hard
     into the corners). Must stay in step with R/THETA in lens.mjs. */
  float r, theta;
  if (uProj < 0.5) {
    r = length(p) * 2.0 * tan(rad(uHFov) / 4.0);
    theta = 2.0 * atan(r / 2.0);
  } else {
    r = length(p) * tan(rad(uHFov) / 2.0);
    theta = atan(r);
  }
  float phi = atan(p.y, p.x);
  vec3 dir = vec3(sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta));
  dir = rotY(rad(uYaw)) * rotX(rad(uPitch)) * rotZ(rad(uRoll)) * dir;

  float thB = acos(clamp(dir.z, -1.0, 1.0));
  float thF = PI - thB;
  float phB = atan(dir.y, dir.x);
  float phF = atan(dir.y, -dir.x);
  vec4 colB = texture2D(uTexB, fishUv(thB, phB, uIhFov, uIvFov));
  vec4 colF = texture2D(uTexF, fishUv(thF, phF, uIhFov, uIvFov));
  /* Mirrors the render exactly: lens0 is the base and is black past its own
     coverage, lens1 is laid over it through its coverage mask, and the mask
     is feathered rather than cut hard (ffmpeg does this with gblur on the
     alpha plane). Blending on real per-lens coverage, not on a hemisphere
     boundary, is what makes a direction neither lens saw read as black here
     the same way it will in the file. */
  float wB = lensAlpha(fishCover(thB, phB, uIhFov, uIvFov));
  float wF = lensAlpha(fishCover(thF, phF, uIhFov, uIvFov));
  /* uMode mirrors what filterGraph will actually build. A single-lens shot is
     one plain v360 off one stream - no mask, no compositing - and coverage()
     has already guaranteed the frame fits inside that lens, so masking it here
     would darken corners the file will render fine. Only the dual path masks,
     and there this is exactly overlay's "over": colB*wB + colF*wF*(1-wB). */
  vec3 outCol;
  if (uMode < 0.5) {
    outCol = colB.rgb;                          // lens1 only
  } else if (uMode < 1.5) {
    outCol = colF.rgb;                          // lens0 only
  } else {
    outCol = mix(colF.rgb * wF, colB.rgb, wB);  // dual
  }
  gl_FragColor = vec4(gradeRgb(outCol), 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, "aPos");
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const U = {};
for (const n of ["uHFov", "uYaw", "uPitch", "uRoll", "uIhFov", "uIvFov", "uAspect", "uMode", "uProj", "uExposure", "uTemp", "uTint", "uShadow",
  "uHighlight", "uContrast", "uSat", "uTexB", "uTexF"]) {
  U[n] = gl.getUniformLocation(prog, n);
}

const tex = {};
const failedFrames = [];

/**
 * Load an image into tex[key], reusing the GL texture object if one already
 * exists there. Scrubbing swaps both textures on nearly every frame; without
 * reuse that would leak a texture per step instead of just re-uploading.
 */
function updateTex(key, src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let t = tex[key];
      if (!t) { t = gl.createTexture(); tex[key] = t; }
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
}
function loadTex(key, src) {
  return updateTex(key, src).then((ok) => { if (!ok) failedFrames.push(key); });
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(stage.clientWidth * dpr);
  const h = Math.round(w / ASPECT);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

/**
 * One full pass for an arbitrary framing. Every uniform is set on every call
 * rather than inherited: the gallery paints other framings between live
 * frames, so nothing may be left over from whatever drew last.
 */
const COLOUR_DEFAULTS = { exposure: 0, temperature: 0, tint: 0, shadow: 0, highlight: 0, contrast: 0, saturation: 1 };
/** Mirrors colourIsIdentity() in lens.mjs. */
function colourIsIdentity(c) {
  const v = { ...COLOUR_DEFAULTS, ...(c || {}) };
  return Object.keys(COLOUR_DEFAULTS).every((k) => v[k] === COLOUR_DEFAULTS[k]);
}
/** Drop keys that are at their default, so saved files stay readable. */
function cleanColour(c) {
  const out = {};
  for (const [k, d] of Object.entries(COLOUR_DEFAULTS)) {
    const v = (c || {})[k];
    if (v != null && v !== d) out[k] = n1(v);
  }
  return out;
}
/** A shot's grade, honouring the older top-level `shadow` field. */
function readColour(sh) {
  const c = { ...COLOUR_DEFAULTS, ...(sh?.colour || {}) };
  if (sh?.shadow != null && sh?.colour?.shadow == null) c.shadow = sh.shadow;
  return c;
}
function paint({ hFov, yaw, pitch, roll, colour = state.colour }) {
  if (!tex.bwd || !tex.fwd) return false;
  resize();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex.bwd);
  gl.uniform1i(U.uTexB, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, tex.fwd);
  gl.uniform1i(U.uTexF, 1);
  gl.uniform1f(U.uHFov, hFov);
  gl.uniform1f(U.uYaw, yaw ?? 0);
  gl.uniform1f(U.uPitch, pitch ?? 0);
  gl.uniform1f(U.uRoll, roll ?? 0);
  gl.uniform1f(U.uIhFov, state.ihFov);
  gl.uniform1f(U.uIvFov, state.ivFov);
  gl.uniform1f(U.uAspect, ASPECT);
  const cov = coverage({ fov: hFov, yaw, pitch, roll });
  gl.uniform1f(U.uMode, cov.dual ? 2 : cov.source === "lens0" ? 1 : 0);
  gl.uniform1f(U.uProj, state.projection === "flat" ? 1 : 0);
  const g = { ...COLOUR_DEFAULTS, ...(colour || {}) };
  gl.uniform1f(U.uExposure, g.exposure);
  gl.uniform1f(U.uTemp, g.temperature);
  gl.uniform1f(U.uTint, g.tint);
  gl.uniform1f(U.uShadow, g.shadow);
  gl.uniform1f(U.uHighlight, g.highlight);
  gl.uniform1f(U.uContrast, g.contrast);
  gl.uniform1f(U.uSat, g.saturation);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return true;
}

function draw() {
  paint({ hFov: state.fov, yaw: state.yaw, pitch: state.pitch, roll: state.roll });
}

const n1 = (v) => Math.round(v * 10) / 10;

/** The calibration the server was built with, i.e. what Reset goes back to. */
const measured = () => ({
  ih: Number(META.ih_fov) || 190,
  iv: Number(META.iv_fov ?? META.ih_fov) || 190,
});

/** v_fov that matches 16:9, per projection. Never h_fov * 9/16. */
function vFov(h, proj = state.projection) {
  if (proj === "flat") {
    const rh = Math.tan((h * Math.PI) / 180 / 2);
    return (2 * Math.atan(rh * (9 / 16)) * 180) / Math.PI;
  }
  const rh = 2 * Math.tan((h * Math.PI) / 180 / 4);
  return (4 * Math.atan((rh * (9 / 16)) / 2) * 180) / Math.PI;
}

/** Which lens covers a framing; dual means the shot crosses the seam.
 * Defaults to the live aim, but takes any framing so the gallery can ask
 * about the shot it is about to paint rather than about whatever is on the
 * sliders right now. */
function coverage({ fov = state.fov, yaw = state.yaw, pitch = state.pitch, roll = state.roll,
                    projection = state.projection } = {}) {
  const flat = projection === "flat";
  const K = flat ? Math.tan((fov * Math.PI) / 180 / 2) : 2 * Math.tan((fov * Math.PI) / 180 / 4);
  const half = (Math.min(state.ihFov, state.ivFov) / 2 * Math.PI) / 180;
  const d2r = Math.PI / 180;
  const cy = Math.cos(yaw * d2r), sy = Math.sin(yaw * d2r);
  const cp = Math.cos(pitch * d2r), sp = Math.sin(pitch * d2r);
  const cr = Math.cos(roll * d2r), sr = Math.sin(roll * d2r);
  let maxB = 0, maxF = 0;
  for (const [px, py] of [[-1, -1 / ASPECT], [1, -1 / ASPECT], [-1, 1 / ASPECT], [1, 1 / ASPECT]]) {
    const rr = Math.hypot(px, py) * K;
    const th = flat ? Math.atan(rr) : 2 * Math.atan(rr / 2);
    const ph = Math.atan2(py, px);
    const x = Math.sin(th) * Math.cos(ph), y = Math.sin(th) * Math.sin(ph), z = Math.cos(th);
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
    const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
    const z3 = -x1 * sy + z2 * cy;
    const thB = Math.acos(Math.max(-1, Math.min(1, z3)));
    maxB = Math.max(maxB, thB);
    maxF = Math.max(maxF, Math.PI - thB);
  }
  if (maxB <= half) return { dual: false, source: "lens1" };
  if (maxF <= half) return { dual: false, source: "lens0" };
  return { dual: true, source: "dual" };
}

function currentShot(name) {
  const cov = coverage();
  return {
    name,
    source: cov.source,
    yaw: n1(state.yaw), pitch: n1(state.pitch), roll: n1(state.roll),
    h_fov: n1(state.fov), v_fov: n1(vFov(state.fov)),
    // only written when it does something, so shots aimed before colour
    // existed keep round-tripping byte-identical
    ...(colourIsIdentity(state.colour) ? {} : { colour: cleanColour(state.colour) }),
  };
}

function buildConfig() {
  return {
    schema: "oio-reframe/1",
    camera: "insta360-x4",
    lens: { model: META.lens_model, ih_fov: n1(state.ihFov), iv_fov: n1(state.ivFov) },
    output: { projection: state.projection, width: 3840, height: 2160 },
    encode: {
      vcodec: "hevc_videotoolbox", bitrate: "60M", vtag: "hvc1",
      acodec: "aac", abitrate: "192k",
    },
    shots: shots.length
      ? shots
      : [currentShot(coverage().source === "lens0" ? "forward" : coverage().source === "lens1" ? "backward" : "seam")],
  };
}

/**
 * The proof frame, and the command that reproduces it.
 *
 * Both come from the SERVER, which builds them with the same `filterGraph`
 * the CLI renders through. This page used to assemble the command itself, and
 * being a second implementation it drifted exactly where it could not be seen:
 * it printed `INPUT.insv`/`OUT.mp4` so it could not be run, and it hard-coded
 * `[0:v:0]`/`[0:v:1]`, which is the X4's both-lenses-in-one-file layout - on
 * an X1, whose lenses are two separate files, that names one lens twice.
 *
 * So the page now states an aim and the server answers with the command and,
 * on request, a frame rendered by running it. The shader above is still the
 * thing to aim with; this is the thing to trust.
 */
let lastCommand = "";
let cmdReq = 0;
let cmdDebounce = null;

/** The aim on screen, in the shape /frame wants. */
function proofPayload() {
  return {
    shot: {
      name: ($("shotName")?.value || "").trim() || "aim",
      h_fov: n1(state.fov),
      yaw: n1(state.yaw), pitch: n1(state.pitch), roll: n1(state.roll),
      ...(colourIsIdentity(state.colour) ? {} : { colour: cleanColour(state.colour) }),
    },
    t: proofTime(),
    projection: state.projection,
    ih_fov: n1(state.ihFov),
    iv_fov: n1(state.ivFov),
  };
}

/**
 * Which instant to render.
 *
 * The filmstrip position when there is one, so the proof lands on the frame
 * being looked at rather than somewhere else in the clip. Falling back to the
 * still the aimer opened on keeps a --no-scrub session honest instead of
 * silently rendering t=0.
 */
function proofTime() {
  if (scrubManifest) return scrubIdx * scrubManifest.interval;
  return META.frame_at ?? 0;
}

/** Refresh the displayed command. Cheap - the server does not run ffmpeg. */
function refreshCmd() {
  clearTimeout(cmdDebounce);
  cmdDebounce = setTimeout(async () => {
    const mine = ++cmdReq;
    try {
      const r = await fetch("/frame", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...proofPayload(), dry: true }),
      });
      const j = await r.json();
      if (mine !== cmdReq) return;          // a later edit already asked again
      if (j.command) {
        lastCommand = j.command;
        $("cmdOut").textContent = j.command;
      } else {
        $("cmdOut").textContent = j.error ?? "No command available.";
      }
    } catch (e) {
      if (mine !== cmdReq) return;
      $("cmdOut").textContent = `Could not reach the server: ${e.message}`;
    }
  }, 200);
}

function proofBusy(on) {
  $("proof").dataset.busy = on ? "true" : "false";
  $("proofBtn").disabled = on;
  $("proofBtn").textContent = on ? "Rendering..." : "Render frame";
}

async function renderProof() {
  proofBusy(true);
  $("proofStat").textContent = `ffmpeg, at ${mm(proofTime())}...`;
  try {
    const r = await fetch("/frame", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(proofPayload()),
    });
    const j = await r.json();
    if (j.command) { lastCommand = j.command; $("cmdOut").textContent = j.command; }
    if (!j.ok || !j.image) {
      $("proofStat").textContent = "";
      status(j.error ?? "The render failed.", "err");
      return;
    }
    let img = $("proofImg");
    if (!img) {
      img = document.createElement("img");
      img.id = "proofImg";
      $("proof").prepend(img);
    }
    img.src = j.image;
    img.alt = `Rendered frame at ${mm(proofTime())}: ${j.source === "dual" ? "both lenses" : j.source}`;
    $("proofPlaceholder").hidden = true;
    // corner-label grammar, same as the live preview: fact left, detail right
    $("proofLabel").hidden = false;
    $("proofLabel").classList.toggle("seam", j.source === "dual");
    $("proofBox").textContent = "ffmpeg " + mm(proofTime());
    $("proofNote").textContent = j.source === "dual" ? "both lenses" : j.source === "lens1" ? "rear lens" : "front lens";
    $("proofStat").textContent = `${(j.ms / 1000).toFixed(1)}s`;
    if (j.note) status(j.note, "err");
  } catch (e) {
    $("proofStat").textContent = "";
    status(`Could not render: ${e.message}`, "err");
  } finally {
    proofBusy(false);
  }
}

/**
 * Draw one shot's framing into a thumbnail.
 *
 * The same GL program and textures render the gallery, so a card shows the
 * actual framing rather than a set of numbers to imagine. Reading back has to
 * happen in this task, before the browser composites and clears the drawing
 * buffer (no preserveDrawingBuffer, which would cost every frame of the live
 * preview to serve a handful of thumbnails).
 */
function drawThumb(sh, cv) {
  if (!paint({ hFov: sh.h_fov, yaw: sh.yaw, pitch: sh.pitch, roll: sh.roll,
               colour: { ...(sh.colour || {}), ...(sh.shadow != null && sh.colour?.shadow == null ? { shadow: sh.shadow } : {}) } })) return;
  const c = cv.getContext("2d");
  c.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, cv.width, cv.height);
}

/**
 * Which clip's shots the stage and gallery are currently editing.
 * -1 is the whole-clip default (aim.json, shared by every clip in the
 * folder); >=0 is clips[idx]'s own shots (clips.json). Lens calibration is
 * never scoped this way - it's a property of the glass, not of a shot.
 */
let activeClipIdx = -1;

function activeShots() {
  if (activeClipIdx < 0) return shots;
  const c = clips[activeClipIdx];
  return (c.shots ??= []);
}
function setActiveShots(list) {
  if (activeClipIdx < 0) shots = list;
  else clips[activeClipIdx].shots = list;
}
function contextLabel(idx = activeClipIdx) {
  const c = idx >= 0 ? clips[idx] : null;
  if (!c) return "Whole clip";
  return `${c.camera_position} ${mm(c.in)}-${mm(c.out)}` + (c.driver ? ` · ${c.driver}` : "");
}
function updateContext() {
  const label = contextLabel();
  $("aimContext").textContent = label;
  $("shotsContext").textContent = label;
  $("saveBtn").textContent = activeClipIdx < 0 ? "Save aim.json" : "Save clips.json";
}

/**
 * Repaint the gallery without rebuilding it. Calibration is global, so every
 * card is wrong the moment ih_fov or iv_fov moves; this runs on release rather
 * than on every input event, which would put four full-size GL passes between
 * each frame of a slider drag.
 */
function refreshThumbs() {
  const cvs = $("shotList").querySelectorAll("canvas");
  const list = activeShots();
  cvs.forEach((cv, i) => list[i] && drawThumb(list[i], cv));
  if (cvs.length) draw();
}

/**
 * Every shot name used anywhere in this file - every clip, plus the
 * whole-clip default - not just the active clip's own. Picking one LOADS its
 * saved aim into the preview (see the shotPicker change handler below) so it
 * can be reviewed or tweaked before committing to anything; it never adds or
 * overwrites by itself - that stays a deliberate "Add current aim" click,
 * same as if the name had been typed fresh.
 */
function renderShotNames() {
  const sel = $("shotPicker");
  sel.textContent = "";
  const first = document.createElement("option");
  first.value = "";
  first.textContent = "+ New shot...";
  sel.appendChild(first);
  const seen = new Set();
  for (const list of [shots, ...clips.map((c) => c.shots || [])]) {
    for (const sh of list) {
      if (seen.has(sh.name)) continue;
      seen.add(sh.name);
      const opt = document.createElement("option");
      opt.value = sh.name;
      opt.textContent = sh.name;
      sel.appendChild(opt);
    }
  }
  // Rebuilding always resets to "new" - a picker left pointed at a name from
  // before the last add/remove would silently mean something different now.
  sel.value = "";
}

/**
 * The first saved definition of a name, searching every clip plus the
 * whole-clip default. Only ever used to load a preview when a name is picked
 * from the shot dropdown - nothing that actually saves reads from this.
 */
function findSavedShot(name) {
  for (const list of [shots, ...clips.map((c) => c.shots || [])]) {
    const hit = list.find((sh) => sh.name === name);
    if (hit) return hit;
  }
  return null;
}

function renderShots() {
  const ul = $("shotList");
  ul.textContent = "";
  const list = activeShots();
  renderShotNames();
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No shots yet. Aim the frame, name it, add it.";
    ul.appendChild(li);
    return;
  }
  list.forEach((sh, i) => {
    const li = document.createElement("li");

    const frame = document.createElement("div");
    frame.className = "thumb";
    const cv = document.createElement("canvas");
    cv.width = 480;
    cv.height = 270;
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label",
      `${sh.name}: yaw ${sh.yaw}, pitch ${sh.pitch}, roll ${sh.roll}, ${sh.h_fov} degree field`);
    const corner = document.createElement("div");
    corner.className = "corner tl" + (sh.source === "dual" ? " seam" : "");
    const nm = document.createElement("span");
    nm.className = "box";
    nm.textContent = sh.name;
    const src = document.createElement("span");
    src.className = "plain";
    src.textContent = sh.source === "dual" ? "both lenses" : sh.source === "lens1" ? "rear" : "front";
    corner.append(nm, src);
    frame.append(cv, corner);

    const row = document.createElement("div");
    row.className = "row";
    const nums = document.createElement("span");
    nums.className = "nums";
    nums.textContent = `yaw ${sh.yaw}  pitch ${sh.pitch}  roll ${sh.roll}  fov ${sh.h_fov}`;
    const load = document.createElement("button");
    load.type = "button";
    load.textContent = "Load";
    load.title = `Aim the preview at ${sh.name}`;
    load.addEventListener("click", () => {
      Object.assign(state, {
        yaw: sh.yaw, pitch: sh.pitch, roll: sh.roll, fov: sh.h_fov,
        lens: sh.source === "lens0" ? "fwd" : "bwd",
      });
      sync();
      $("shotName").value = sh.name;
      status(`Loaded "${sh.name}" into the preview.`, "ok");
    });
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Remove";
    del.addEventListener("click", () => { list.splice(i, 1); renderShots(); });
    row.append(nums, load, del);

    li.append(frame, row);
    ul.appendChild(li);
    drawThumb(sh, cv);
  });
  draw();   // put the live preview back after borrowing the buffer
}

function sync() {
  $("sYaw").value = state.yaw;
  $("sPitch").value = state.pitch;
  $("sRoll").value = state.roll;
  $("sFov").value = state.fov;
  $("sIh").value = state.ihFov;
  $("sIv").value = state.ivFov;
  $("oYaw").textContent = n1(state.yaw) + "\u00b0";
  $("oPitch").textContent = n1(state.pitch) + "\u00b0";
  $("oRoll").textContent = n1(state.roll) + "\u00b0";
  $("oFov").textContent = n1(state.fov) + "\u00b0";
  const g = { ...COLOUR_DEFAULTS, ...state.colour };
  const fmt = {
    exposure: (v) => (v > 0 ? "+" : "") + v.toFixed(2),
    contrast: (v) => (v > 0 ? "+" : "") + v.toFixed(2),
    shadow: (v) => v.toFixed(2), highlight: (v) => v.toFixed(2),
    saturation: (v) => v.toFixed(2), temperature: (v) => String(Math.round(v)),
    tint: (v) => String(Math.round(v)),
  };
  for (const [id, key] of Object.entries(COLOUR_SLIDERS)) {
    const v = g[key], el = $("o" + id.slice(1));
    el.textContent = fmt[key](v);
    el.style.color = v === COLOUR_DEFAULTS[key] ? "var(--muted)" : "";
    if (Number($(id).value) !== v) $(id).value = String(v);
  }
  $("colourCtx").textContent = $("shotName")?.value || contextLabel();
  $("oIh").textContent = n1(state.ihFov) + "\u00b0";
  $("oIv").textContent = n1(state.ivFov) + "\u00b0";
  $("oProj").textContent = state.projection === "flat" ? "rectilinear" : "stereographic";
  if ($("sProj").value !== state.projection) $("sProj").value = state.projection;
  // compare against what the server reported, never a literal - the measured
  // values change, and a stale literal would strand the reset button on screen
  $("lensReset").hidden = state.ihFov === measured().ih && state.ivFov === measured().iv;
  for (const [id, v] of [["sYaw", state.yaw], ["sPitch", state.pitch], ["sRoll", state.roll], ["sFov", state.fov]]) {
    $(id).setAttribute("aria-valuetext", n1(v) + " degrees");
  }
  $("hYaw").textContent = "yaw " + n1(state.yaw);
  $("hPitch").textContent = "pitch " + n1(state.pitch);
  $("hRoll").textContent = "roll " + n1(state.roll);
  $("hFov").textContent = "fov " + n1(state.fov);

  const cov = coverage();
  // The seam state changes what actually gets rendered, so it belongs on the
  // frame in corner-label grammar, not in a pill far below the preview.
  $("lensLabel").classList.toggle("seam", cov.dual);
  $("lensBox").textContent = cov.dual ? "both lenses" : cov.source === "lens1" ? "rear lens" : "front lens";
  $("lensNote").textContent = cov.dual ? "blended seam" : "single";

  const badge = $("modeBadge");
  badge.textContent = cov.dual ? "feathered seam - both lenses" : cov.source === "lens1" ? "rear lens" : "front lens";
  badge.className = "meta" + (cov.dual ? " dual" : "");
  $("cmdHint").textContent =
    (cov.dual
      ? "Crosses the seam: each lens crops straight to this frame, and one is blended over the other through a blurred coverage mask - a feather, not a true stitch, so subjects close to the camera can still show parallax there. "
      : "Fits inside one lens, so no blending is involved. ") +
    "The command below is the whole clip at full size, built by the server from the same graph the frame above was rendered with - real paths, runnable as shown, writing to local scratch rather than the working drive.";

  refreshCmd();
  draw();
}

function status(msg, kind = "", undo = null) {
  const el = $("status");
  const tag = kind === "err" ? "Error" : kind === "ok" ? "Done" : "Ready";
  el.className = "status" + (kind ? " " + kind : "");
  el.setAttribute("aria-live", kind === "err" ? "assertive" : "polite");
  el.textContent = "";
  const t = document.createElement("span");
  t.className = "tag";
  t.textContent = tag;
  const m = document.createElement("span");
  m.id = "statusMsg";
  m.textContent = msg;
  el.append(t, m);
  if (undo) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Undo";
    b.addEventListener("click", undo, { once: true });
    el.appendChild(b);
  }
}

for (const id of ["sYaw", "sPitch", "sRoll", "sFov", "sIh", "sIv"]) {
  $(id).addEventListener("input", (e) => {
    const key = { sYaw: "yaw", sPitch: "pitch", sRoll: "roll", sFov: "fov", sIh: "ihFov", sIv: "ivFov" }[id];
    state[key] = parseFloat(e.target.value);
    sync();
  });
}
/** The colour block is one object, so every slider here writes into it. */
const COLOUR_SLIDERS = { sExposure: "exposure", sContrast: "contrast", sShadow: "shadow",
  sHighlight: "highlight", sSat: "saturation", sTemp: "temperature", sTint: "tint" };
for (const [id, key] of Object.entries(COLOUR_SLIDERS)) {
  $(id).addEventListener("input", (e) => {
    state.colour = { ...state.colour, [key]: parseFloat(e.target.value) };
    sync();
  });
  // the gallery paints each shot's own grade, so it only catches up on release
  $(id).addEventListener("change", refreshThumbs);
}
$("colourReset").addEventListener("click", () => {
  state.colour = { ...COLOUR_DEFAULTS };
  sync(); refreshThumbs();
  status("Colour reset for this shot.", "ok");
});
$("colourCopy").addEventListener("click", () => {
  const c = { ...state.colour };
  const list = activeShots();
  if (!list.length) { status("No shots on this clip yet.", "err"); return; }
  const before = list.map((sh) => sh.colour);
  list.forEach((sh) => { sh.colour = { ...c }; delete sh.shadow; });
  renderShots(); refreshThumbs();
  status(`Copied this grade to ${list.length} shot(s) on this clip.`, "ok", () => {
    list.forEach((sh, i) => { sh.colour = before[i]; });
    renderShots(); refreshThumbs();
    status("Grade copy undone.", "ok");
  });
});

// the gallery only depends on calibration, and only catches up on release
for (const id of ["sIh", "sIv"]) $(id).addEventListener("change", refreshThumbs);

// Output projection is the fisheye control. It changes what every angle means,
// so the gallery has to be repainted and v_fov recomputed - sync() does both.
$("sProj").addEventListener("change", (e) => {
  state.projection = e.target.value;
  sync();
  refreshThumbs();
  status(state.projection === "flat"
    ? "Rectilinear: straight lines stay straight, corners stretch. Best under about 120 degrees."
    : "Stereographic: faces stay round, very long straight lines bow a little.", "ok");
});

let drag = null;
const pt = (e) => (e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY });
function down(e) { drag = pt(e); stage.classList.add("dragging"); if (e.cancelable) e.preventDefault(); }
function move(e) {
  if (!drag) return;
  const p = pt(e);
  const k = state.fov / stage.clientWidth;
  state.yaw = Math.max(-180, Math.min(180, state.yaw - (p.x - drag.x) * k));
  state.pitch = Math.max(-120, Math.min(120, state.pitch + (p.y - drag.y) * k));
  drag = p;
  sync();
  if (e.cancelable) e.preventDefault();
}
function up() { drag = null; stage.classList.remove("dragging"); }
stage.addEventListener("mousedown", down);
window.addEventListener("mousemove", move);
window.addEventListener("mouseup", up);
stage.addEventListener("touchstart", down, { passive: false });
stage.addEventListener("touchmove", move, { passive: false });
stage.addEventListener("touchend", up);
// Only claim the wheel when the operator asks for zoom; otherwise the stage
// is a 640px-tall scroll trap in an 800px viewport.
stage.addEventListener("wheel", (e) => {
  if (!e.altKey && !e.metaKey && !e.ctrlKey) return;
  const step = Math.max(0.5, Math.min(8, Math.abs(e.deltaY) * (e.deltaMode === 1 ? 2 : 0.08)));
  state.fov = Math.max(50, Math.min(170, state.fov + (e.deltaY > 0 ? step : -step)));
  sync();
  e.preventDefault();
}, { passive: false });

function applyPreset(k) {
  Object.assign(state, { ...PRESETS[k], lens: k });  // calibration is deliberately untouched
  sync();
}
$("presetBwd").addEventListener("click", () => applyPreset("bwd"));
$("presetFwd").addEventListener("click", () => applyPreset("fwd"));
$("levelBtn").addEventListener("click", () => { state.roll = 180; sync(); });
$("revertBtn").addEventListener("click", () => {
  Object.assign(state, lastCommitted);
  sync();
  status("Reverted to the last saved aim.", "ok");
});
$("guidesBtn").addEventListener("click", (e) => {
  const on = stage.classList.toggle("show-guides");
  e.currentTarget.setAttribute("aria-pressed", String(on));
});

/**
 * Picking a saved name loads its aim so it can be looked at before deciding
 * anything - the preview jumps there, the Name field fills in, and that's
 * all. Add current aim is still the only thing that writes, and it always
 * writes to the clip currently on screen, never wherever the picked shot
 * happened to come from.
 */
$("shotPicker").addEventListener("change", (e) => {
  const name = e.target.value;
  $("shotName").value = name;
  if (!name) return;   // "+ New shot..." - nothing to load, just a clear field
  const sh = findSavedShot(name);
  if (!sh) return;
  Object.assign(state, {
    yaw: sh.yaw, pitch: sh.pitch, roll: sh.roll, fov: sh.h_fov,
    colour: readColour(sh),
    lens: sh.source === "lens0" ? "fwd" : "bwd",
  });
  sync();
  status(`Loaded "${name}" for review. Add current aim will save it to ${contextLabel()}.`, "ok");
});

$("addShot").addEventListener("click", () => {
  const input = $("shotName");
  const cov = coverage();
  const fallback = cov.source === "lens0" ? "forward" : cov.source === "lens1" ? "backward" : "seam";
  const raw = (input.value || "").trim() || fallback;
  const name = raw.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (!name) { status("Give the shot a name.", "err"); input.focus(); return; }

  const list = activeShots();
  const idx = list.findIndex((s) => s.name === name);
  const replaced = idx >= 0 ? list[idx] : null;
  const shot = currentShot(name);
  if (replaced) list[idx] = shot; else list.push(shot);
  input.value = "";
  renderShots();
  renderClipStrip();   // the shot-count badge on this clip's card just changed

  if (replaced) {
    // Overwriting an aim used to happen silently and still report "Added".
    status(`Replaced "${name}" (yaw ${replaced.yaw}, pitch ${replaced.pitch}).`, "ok", () => {
      list[list.findIndex((s) => s.name === name)] = replaced;
      renderShots();
      renderClipStrip();
      status(`Restored "${name}".`, "ok");
    });
  } else {
    status(`Added "${name}"${raw !== name ? ` (named "${name}")` : ""}.`, "ok");
  }
});

/** The clips.json bundle is self-contained: lens/output/encode copied in
 * alongside the clips, so the file never needs cross-referencing aim.json to
 * be renderable on its own. */
function buildClipsBundle() {
  return {
    schema: "oio-clips/1",
    clip: META.clip,
    lens: { model: META.lens_model, ih_fov: n1(state.ihFov), iv_fov: n1(state.ivFov) },
    output: { projection: state.projection, width: 3840, height: 2160 },
    encode: {
      vcodec: "hevc_videotoolbox", bitrate: "60M", vtag: "hvc1",
      acodec: "aac", abitrate: "192k",
    },
    clips,
  };
}

/** One Save button that does the right thing for whatever is on screen:
 * the whole-clip default goes to aim.json, a segment's own shots go into
 * clips.json alongside every other marked segment. */
$("saveBtn").addEventListener("click", async () => {
  const wholeClip = activeClipIdx < 0;
  try {
    const res = await fetch(wholeClip ? "/aim" : "/clips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(wholeClip ? buildConfig() : buildClipsBundle()),
    });
    const j = await res.json();
    if (j.ok) {
      if (wholeClip) lastCommitted = { ...state };
      status(wholeClip ? `Saved ${j.path}.` : `Saved ${clips.length} clip(s) to ${j.path}.`, "ok");
    } else {
      status("Save failed: " + (j.error || res.status), "err");
    }
  } catch (e) {
    status("Save failed: " + e.message, "err");
  }
});

/**
 * Adopt a config: lens calibration, shot list, and the first shot as the aim.
 * Shared by the file picker and the aim.json the server hands over at startup.
 * Targets whichever context is active - opening a file while a segment is
 * selected loads it as that segment's starting point, not the whole-clip one.
 */
function applyConfig(cfg) {
  if (cfg.output?.projection === "flat" || cfg.output?.projection === "sg") {
    state.projection = cfg.output.projection;
  }
  if (cfg.lens) {
    const ih = Number(cfg.lens.ih_fov) || state.ihFov;
    const iv = Number(cfg.lens.iv_fov ?? cfg.lens.ih_fov) || state.ivFov;
    // Same rule the renderer applies (checkLens in lens.mjs): a lens that
    // reaches 180 degrees or less cannot meet its partner, so a config saying
    // so is not a preference to honour, it is a file written before the
    // calibration was fixed. Honouring it would put a black wedge in the
    // preview that the render will not have - the exact drift this whole
    // preview is meant to rule out.
    if (ih > 180 && iv > 180) {
      state.ihFov = ih;
      state.ivFov = iv;
    } else {
      status(
        `Ignoring this file's lens calibration (${ih}/${iv}): under 180 degrees the two ` +
        `lenses cannot meet. Using the measured ${n1(measured().ih)}/${n1(measured().iv)} - ` +
        `save to update the file.`,
        "err",
      );
      state.ihFov = measured().ih;
      state.ivFov = measured().iv;
    }
  }
  if (Array.isArray(cfg.shots) && cfg.shots.length) {
    setActiveShots(cfg.shots);
    const s0 = activeShots()[0];
    Object.assign(state, {
      yaw: s0.yaw, pitch: s0.pitch, roll: s0.roll, fov: s0.h_fov,
      colour: readColour(s0),
      lens: s0.source === "lens0" ? "fwd" : "bwd",
    });
  }
  renderShots();
  renderClipStrip();
  sync();
}

$("openBtn").addEventListener("click", () => $("openFile").click());
$("openFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const cfg = JSON.parse(await file.text());
    if (!Array.isArray(cfg.shots)) throw new Error("no shots array");
    if (cfg.schema && cfg.schema !== "oio-reframe/1") {
      status(`Loaded ${file.name}, but its schema is ${cfg.schema}, not oio-reframe/1.`, "err");
    }
    applyConfig(cfg);
    // Save still writes wherever the active context writes, which is rarely
    // the file just opened - say so rather than let a save land unexpectedly.
    const dest = activeClipIdx < 0 ? META.aim_path : "clips.json";
    status(`Loaded ${file.name} (${cfg.shots.length} shot(s)) into ${contextLabel()}. Save writes to ${dest}.`, "ok");
  } catch (err) {
    status(`Could not read ${file.name}: ${err.message}`, "err");
  } finally {
    e.target.value = "";   // same file twice in a row still fires
  }
});

$("copyBtn").addEventListener("click", async () => {
  if (!lastCommand) return status("No command yet - the server has not answered.", "err");
  try {
    await navigator.clipboard.writeText(lastCommand);
    status("Command copied to the clipboard.", "ok");
  } catch {
    status("Copy blocked by the browser. Select the command text instead.", "err");
  }
});

$("proofBtn").addEventListener("click", renderProof);

window.addEventListener("resize", draw);

/**
 * Scrub and mark is the page itself, always there. Aim, Colour and Lens are
 * panels that open beside the frame from the rail on its right edge - opening
 * one pushes the preview narrower rather than covering the thing being aimed.
 * At most one is open, and none are at first.
 */
const RAIL = { tabAim: "panelAim", tabColour: "panelColour", tabLens: "panelLens" };
function setPanel(which) {
  for (const [tab, panel] of Object.entries(RAIL)) {
    const on = tab === which;
    $(tab).setAttribute("aria-pressed", String(on));
    $(panel).hidden = !on;
  }
  // the canvas backing size follows its box, which just changed
  requestAnimationFrame(() => { resize(); draw(); });
}
function openPanel() {
  return Object.keys(RAIL).find((t) => $(t).getAttribute("aria-pressed") === "true") || null;
}
for (const tab of Object.keys(RAIL)) {
  $(tab).addEventListener("click", () => setPanel(openPanel() === tab ? null : tab));
}

/**
 * Scrubbing through the raw clip so cuts (driver swaps, camera moved off the
 * car, run boundaries) can be marked by eye instead of guessed at from an
 * audio envelope or 30-second contact sheets - both tried on this footage
 * first and neither was trustworthy on its own.
 *
 * The filmstrip is a still every N seconds (extractScrubFrames on the CLI
 * side), not a video element: an .insv is dual-fisheye and no browser can
 * decode or dewarp that natively. Dragging the range re-points the SAME live
 * preview textures at the frame pair nearest that timestamp, so scrubbing
 * looks through the current aim rather than at a flat unwarped image.
 */
let scrubManifest = null;
let scrubIdx = 0;
let scrubReq = 0;
let scrubDebounce = null;
let clips = [];
let clipDraft = { in: null, out: null };

const mm = (s) => {
  s = Math.max(0, Math.round(s));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

async function pollScrubManifest(delayMs = 1500) {
  try {
    const r = await fetch("/scrub/manifest.json");
    if (r.ok) {
      scrubManifest = await r.json();
      setupScrubber();
      return;
    }
  } catch { /* server not up yet on the very first poll */ }
  setTimeout(() => pollScrubManifest(delayMs), delayMs);
}

function setupScrubber() {
  const n = scrubManifest.count;
  $("scrubHint").textContent = `${n} frame(s), one every ${scrubManifest.interval}s.`;
  $("scrubMeta").textContent = mm(scrubManifest.duration);
  const range = $("scrubRange");
  range.max = String(Math.max(0, n - 1));
  range.disabled = n < 2;
  $("setIn").disabled = false;
  $("setOut").disabled = false;
  $("addClip").disabled = false;

  const strip = $("filmstrip");
  strip.hidden = false;
  strip.textContent = "";
  for (let i = 0; i < n; i++) {
    const img = document.createElement("img");
    img.className = "fthumb";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = `/scrub/lens1/thumb/${i}.jpg`;
    img.alt = `t=${mm(i * scrubManifest.interval)}`;
    img.title = mm(i * scrubManifest.interval);
    img.addEventListener("click", () => goToScrubIndex(i, { scroll: false }));
    strip.appendChild(img);
  }
  goToScrubIndex(0);
  renderClipStrip();   // cards made before the manifest arrived had no thumbnail yet
}

async function goToScrubIndex(i, { scroll = true } = {}) {
  if (!scrubManifest) return;
  i = Math.max(0, Math.min(scrubManifest.count - 1, i));
  scrubIdx = i;
  $("scrubRange").value = String(i);
  $("scrubTime").textContent = mm(i * scrubManifest.interval);
  const thumbs = $("filmstrip").children;
  for (let k = 0; k < thumbs.length; k++) thumbs[k].classList.toggle("current", k === i);
  if (scroll && thumbs[i]) thumbs[i].scrollIntoView({ inline: "center", block: "nearest" });

  const myReq = ++scrubReq;
  const [okB, okF] = await Promise.all([
    updateTex("bwd", `/scrub/lens1/full/${i}.jpg`),
    updateTex("fwd", `/scrub/lens0/full/${i}.jpg`),
  ]);
  if (myReq !== scrubReq) return; // a later drag already asked for a different frame
  if (!okB || !okF) { status(`Could not load the frame at ${mm(i * scrubManifest.interval)}.`, "err"); return; }
  draw();
}

$("scrubRange").addEventListener("input", (e) => {
  const i = Number(e.target.value);
  // update the readout immediately; debounce only the image loads, so
  // dragging fast doesn't queue up dozens of stale fetches behind the finger
  $("scrubTime").textContent = mm(i * (scrubManifest?.interval ?? 0));
  clearTimeout(scrubDebounce);
  scrubDebounce = setTimeout(() => goToScrubIndex(i, { scroll: true }), 60);
});

$("setIn").addEventListener("click", () => {
  clipDraft.in = scrubIdx * scrubManifest.interval;
  $("clipInVal").textContent = mm(clipDraft.in);
});
$("setOut").addEventListener("click", () => {
  clipDraft.out = scrubIdx * scrubManifest.interval;
  $("clipOutVal").textContent = mm(clipDraft.out);
});

/**
 * Switch which clip's shots the stage and gallery are editing, and jump
 * straight to Aim mode - selecting a clip is how you start aiming it.
 *
 * Async and awaited through the scrub jump on purpose: goToScrubIndex loads
 * new lens textures, and drawThumb (inside renderShots) paints gallery
 * thumbnails from whatever textures are CURRENTLY bound. Firing the jump
 * without waiting for it left the gallery painting with the previous clip's
 * frame still loaded - the thumbnails looked frozen across a clip switch even
 * though the shot data underneath was correct.
 *
 * Deliberately does NOT copy shots in from another clip on its own - the Name
 * field's dropdown already shows every name in play, so reusing one is an
 * explicit pick-and-aim rather than something that appears in a clip's list
 * before you asked for it.
 */
async function selectClip(idx) {
  activeClipIdx = idx;
  const list = activeShots();
  if (list.length) {
    const s0 = list[0];
    Object.assign(state, {
      yaw: s0.yaw, pitch: s0.pitch, roll: s0.roll, fov: s0.h_fov,
      colour: readColour(s0),
      lens: s0.source === "lens0" ? "fwd" : "bwd",
    });
  }
  if (idx >= 0 && scrubManifest) {
    await goToScrubIndex(Math.round(clips[idx].in / scrubManifest.interval), { scroll: false });
  }
  renderShots();
  renderClipStrip();
  updateContext();
  if (!openPanel()) setPanel("tabAim");
  sync();
}

/**
 * One list, two jobs: where a newly marked clip shows up, and how you pick
 * which clip's shots the panels above are editing. "Whole clip" is always
 * the first card - the folder-wide default aim.json still covers, even with
 * nothing marked yet.
 */
function renderClipStrip() {
  const wrap = $("clipStrip");
  wrap.textContent = "";

  function makeCard(idx) {
    const card = document.createElement("div");
    card.className = "ccard" + (idx === activeClipIdx ? " active" : "");

    const main = document.createElement("button");
    main.type = "button";
    main.className = "cmain";
    main.setAttribute("aria-pressed", String(idx === activeClipIdx));

    const body = document.createElement("span");
    body.className = "cbody";
    const pos = document.createElement("span");
    pos.className = "cpos";

    if (idx >= 0) {
      const c = clips[idx];
      if (scrubManifest) {
        const img = document.createElement("img");
        img.className = "cthumb";
        img.loading = "lazy";
        img.alt = "";
        img.src = `/scrub/lens1/thumb/${Math.round(c.in / scrubManifest.interval)}.jpg`;
        main.appendChild(img);
      }
      pos.textContent = c.camera_position;
      const range = document.createElement("span");
      range.className = "crange";
      range.textContent = `${mm(c.in)}-${mm(c.out)}`;
      const n = c.shots?.length || 0;
      const shotsEl = document.createElement("span");
      shotsEl.className = "cshots";
      shotsEl.textContent = `${n} shot${n === 1 ? "" : "s"}`;
      body.append(pos, range, shotsEl);
      if (c.driver) {
        const driverEl = document.createElement("span");
        driverEl.className = "cdriver";
        driverEl.textContent = c.driver;
        body.append(driverEl);
      }
    } else {
      pos.textContent = "Whole clip";
      const n = shots.length;
      const shotsEl = document.createElement("span");
      shotsEl.className = "cshots";
      shotsEl.textContent = `${n} shot${n === 1 ? "" : "s"}`;
      body.append(pos, shotsEl);
    }

    main.appendChild(body);
    main.title = idx >= 0 ? "Aim this clip" : "Aim the whole-clip default";
    main.addEventListener("click", () => selectClip(idx));
    card.appendChild(main);

    if (idx >= 0) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "cremove";
      del.title = "Remove this clip";
      del.textContent = "×";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        clips.splice(idx, 1);
        if (activeClipIdx === idx) selectClip(-1);
        else {
          if (activeClipIdx > idx) activeClipIdx--;
          renderClipStrip();
        }
      });
      card.appendChild(del);
    }
    return card;
  }

  wrap.appendChild(makeCard(-1));
  clips.forEach((_, i) => wrap.appendChild(makeCard(i)));
}

/**
 * Next free clip id.
 *
 * Numbering by list length collides the moment a clip is removed: delete one
 * of four and the next add is "clip-4" all over again, so a file can end up
 * with two clips claiming the same id and anything selecting by id silently
 * gets the wrong footage. Take one past the highest number ever used instead.
 */
function nextClipId() {
  const used = clips.map((c) => Number(/^clip-(\d+)$/.exec(c.id || "")?.[1]) || 0);
  return `clip-${Math.max(0, ...used) + 1}`;
}

$("addClip").addEventListener("click", () => {
  if (clipDraft.in == null || clipDraft.out == null) {
    status("Set both a clip in and a clip out first.", "err");
    return;
  }
  if (clipDraft.out <= clipDraft.in) {
    status("Clip out has to be after clip in.", "err");
    return;
  }
  clips.push({
    id: nextClipId(),
    camera_position: $("clipPos").value,
    in: clipDraft.in,
    out: clipDraft.out,
    driver: $("clipDriver").value.trim() || null,
    note: $("clipNote").value.trim() || null,
    confidence: "human",
    shots: [],
  });
  clipDraft = { in: null, out: null };
  $("clipInVal").textContent = "--:--";
  $("clipOutVal").textContent = "--:--";
  $("clipDriver").value = "";
  $("clipNote").value = "";
  renderClipStrip();
  status(`Added ${clips.at(-1).camera_position} ${mm(clips.at(-1).in)}-${mm(clips.at(-1).out)}. Click its thumbnail above to aim it.`, "ok");
});

(async function init() {
  try {
    META = { ...META, ...(await (await fetch("/meta.json")).json()) };
    state.ihFov = Number(META.ih_fov) || state.ihFov;
    state.ivFov = Number(META.iv_fov ?? META.ih_fov) || state.ivFov;
  } catch { /* defaults are fine */ }
  $("kicker").textContent = `${META.clip || "clip"}  |  ${META.lens_model}`;
  // A stills-only session has no master to seek into, so say that on the
  // button rather than letting it fail once it is pressed.
  if (META.can_render === false) {
    $("proofBtn").disabled = true;
    $("proofPlaceholder").textContent =
      "Opened from stills, so there is no clip to render from. Re-open with --input <clip.insv> to prove a frame here.";
  }
  $("lensReset").addEventListener("click", () => {
    state.ihFov = measured().ih;
    state.ivFov = measured().iv;
    sync();
    refreshThumbs();
    status(`Lens reset to the measured ${n1(state.ihFov)} / ${n1(state.ivFov)}.`, "ok");
  });

  // reopen on an existing aim so a second pass starts where the last left off
  let prev = null;
  try {
    prev = await (await fetch("/aim.json")).json();
  } catch { /* no prior aim */ }

  try {
    const r = await fetch("/clips.json");
    if (r.ok) {
      const c = await r.json();
      // older drafts predate per-clip shots; give each clip an array to own
      if (Array.isArray(c.clips)) clips = c.clips.map((cl) => ({ ...cl, shots: cl.shots || [] }));
    }
  } catch { /* no prior clip marks */ }
  renderClipStrip();

  await Promise.all([loadTex("bwd", "/frames/lens1.jpg"), loadTex("fwd", "/frames/lens0.jpg")]);
  // textures first: the gallery thumbnails are rendered, not described
  if (prev) applyConfig(prev);
  renderShots();
  updateContext();
  lastCommitted = { ...state };
  sync();
  if (failedFrames.length) {
    status(`Could not load ${failedFrames.length} lens frame(s). The preview will be black.`, "err");
  } else {
    status(`Aim will save to ${META.aim_path}`);
  }

  if (META.scrub) pollScrubManifest();
  else $("scrubHint").textContent = "No filmstrip for this session (needs --input, not --frames).";
})();
