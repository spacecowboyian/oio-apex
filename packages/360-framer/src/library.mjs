/**
 * Collect every shot ever aimed, across bodies and events, into one list.
 *
 * Shots live in two shapes and both have to be read or the library lies about
 * what exists. `aim.json` holds shots that apply to a whole folder of clips;
 * `<stem>.clips.json` holds per-clip marks, each of which can carry its OWN
 * shots. The X4 work used the first, the X1 work used the second, so reading
 * only one of them would have found 5 shots or 8 but never all 13.
 *
 * Each shot is returned as an INSTANCE - a set of angles on one mount - and
 * grouped under the intent it realises (see `shots.json`). The angles are not
 * the reusable part: the same intent came out 130 degrees apart in roll on two
 * different mounts. The intent is.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { resolveCamera, IH_FOV, IV_FOV } from "./lens.mjs";
import { isMaster, lensSources } from "./frames.mjs";

const VOCAB = JSON.parse(
  await readFile(new URL("../shots.json", import.meta.url), "utf8"),
);

/** Which intent a hand-typed shot name belongs to, or null. */
export function intentFor(name) {
  const k = String(name ?? "").trim().toLowerCase();
  return VOCAB.intents.find((i) => i.match.some((m) => m.toLowerCase() === k)) ?? null;
}

export function intents() {
  return VOCAB.intents;
}

export function mounts() {
  return VOCAB.mounts;
}

/**
 * Instances grouped by MOUNT, then by the intent each realises.
 *
 * The mount is the unit of the decision on the day - one placement on the
 * windscreen yields the course ahead and the driver behind - so it is the unit
 * the library is read in. Grouping by shot alone hides that they come as a
 * pair, which is the thing that makes the setup repeatable.
 */
export function byMount(rows) {
  const out = VOCAB.mounts.map((m) => ({
    mount: m,
    intents: VOCAB.intents
      .filter((i) => i.mount === m.id)
      .map((i) => ({ intent: i, rows: rows.filter((r) => r.intent === i.id) })),
  }));
  const loose = rows.filter((r) => !r.intent);
  if (loose.length) {
    out.push({
      mount: {
        id: "unassigned",
        title: "Unassigned",
        where: "Not yet classified.",
        needs: "Each of these is either a new intent worth naming or an alias worth adding to shots.json.",
      },
      intents: [{ intent: { id: "unassigned", title: "Unclassified", frames: "", use: "" }, rows: loose }],
    });
  }
  return out;
}

/**
 * Every *.json under a root that could carry shots, ignoring the noise.
 *
 * macOS writes an AppleDouble `._name.json` sidecar next to every file on an
 * exFAT drive. They are not JSON, they are not UTF-8, and reading one throws a
 * UnicodeDecodeError that looks alarming and means nothing - so they are
 * skipped by name rather than caught by accident.
 */
async function configFiles(root) {
  const out = [];
  async function walk(d) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;   // unreadable folder is not the library's problem
    }
    for (const e of entries) {
      if (e.name.startsWith("._")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        // renders/ carries a COPY of the aim that produced it. Counting those
        // would double every shot and make the library look twice as rich as
        // the work actually is.
        if (e.name === "renders" || e.name === "render-previews" || e.name.startsWith(".")) continue;
        await walk(p);
      } else if (e.name === "aim.json" || e.name.endsWith(".clips.json")) {
        out.push(p);
      }
    }
  }
  await walk(root);
  return out.sort();
}

/**
 * Which body a config belongs to - from the FOOTAGE beside it, never from the
 * config's own `camera` field.
 *
 * That field is free text nobody validates, and it is already wrong on disk:
 * `x1/aim.json` says "insta360-x4", so trusting it filed every X1 shot in the
 * library under the wrong camera. The footage cannot lie the same way - how a
 * body stores its two lenses, and how big the frame is, identify it - and
 * `lensSources` already does exactly that for the aimer.
 *
 * Cached per folder: one ffprobe per folder, not one per shot.
 */
const bodyCache = new Map();
async function cameraOf(cfg, file) {
  const dir = path.dirname(file);
  const ih = cfg.lens?.ih_fov ?? IH_FOV;
  const iv = cfg.lens?.iv_fov ?? cfg.lens?.ih_fov ?? IV_FOV;

  if (!bodyCache.has(dir)) {
    let found = null;
    try {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.name.startsWith("._") || !e.isFile() || !isMaster(path.join(dir, e.name))) continue;
        const src = await lensSources(path.join(dir, e.name));
        found = src.camera;
        break;
      }
    } catch { /* drive unmounted, or a folder with no master in it */ }
    bodyCache.set(dir, found);
  }
  const c = bodyCache.get(dir);
  return {
    id: c?.id ?? "unknown",
    label: c?.label ?? "unidentified body (no readable footage beside this config)",
    ihFov: ih,
    ivFov: iv,
    // What the body actually is, as opposed to what this config was aimed at.
    // They differ whenever an aim predates a calibration change - x1/aim.json
    // still carries the impossible 187/175 - and the library should show that
    // rather than quietly print the good numbers.
    measured: c ? { ihFov: c.ihFov, ivFov: c.ivFov, confidence: c.confidence } : null,
  };
}

/**
 * @returns {Array<{intent, shot, camera, source, angles, fov, file, scope, car, driver, clip}>}
 */
export async function collect(root) {
  const files = await configFiles(root);
  const rows = [];

  for (const file of files) {
    let cfg;
    try {
      cfg = JSON.parse(await readFile(file, "utf8"));
    } catch {
      continue;   // a half-written or non-JSON file is skipped, not fatal
    }
    const camera = await cameraOf(cfg, file);
    const projection = cfg.output?.projection ?? "sg";
    // The folder is the closest thing to a car identifier we have. It is not
    // authoritative - Brains owns which car is which - so it is carried as a
    // label to look up later, never as a claim about the vehicle.
    const car = path.basename(path.dirname(file));

    const push = (s, extra) => {
      if (!s?.name) return;
      rows.push({
        intent: intentFor(s.name)?.id ?? null,
        shot: s.name,
        camera,
        projection,
        source: s.source ?? null,
        angles: { yaw: s.yaw ?? 0, pitch: s.pitch ?? 0, roll: s.roll ?? 0 },
        fov: { h: s.h_fov ?? null, v: s.v_fov ?? null },
        colour: s.colour ?? null,
        file,
        car,
        ...extra,
      });
    };

    if (file.endsWith("aim.json")) {
      for (const s of cfg.shots ?? []) push(s, { scope: "folder", clip: null, driver: null });
    } else {
      const stem = path.basename(file).replace(/\.clips\.json$/, "");
      for (const c of cfg.clips ?? []) {
        for (const s of c.shots ?? []) {
          push(s, {
            scope: "clip",
            clip: stem,
            driver: c.driver && c.driver !== "unconfirmed" ? c.driver : null,
            range: c.in != null && c.out != null ? [c.in, c.out] : null,
          });
        }
      }
    }
  }
  return rows;
}

/**
 * Fold instances into one row per (intent, shot name, mount).
 *
 * The same shot on the same mount is saved once per clip it was used on, so
 * without this the X1 side-window pair appears four times with identical
 * angles. Identical angles are one instance used repeatedly, which is worth
 * saying once and counting - not worth listing four times.
 */
export function dedupe(rows) {
  const seen = new Map();
  for (const r of rows) {
    const key = [r.camera.id, r.shot.toLowerCase(), r.angles.yaw, r.angles.pitch, r.angles.roll, r.fov.h].join("|");
    const hit = seen.get(key);
    if (hit) {
      hit.uses++;
      if (r.driver && !hit.drivers.includes(r.driver)) hit.drivers.push(r.driver);
      if (r.car && !hit.cars.includes(r.car)) hit.cars.push(r.car);
      continue;
    }
    seen.set(key, { ...r, uses: 1, drivers: r.driver ? [r.driver] : [], cars: r.car ? [r.car] : [] });
  }
  return [...seen.values()];
}

/** Instances grouped by intent, unclassified ones last. */
export function byIntent(rows) {
  const groups = VOCAB.intents.map((i) => ({ intent: i, rows: rows.filter((r) => r.intent === i.id) }));
  const loose = rows.filter((r) => !r.intent);
  if (loose.length) {
    groups.push({
      intent: {
        id: "unassigned",
        title: "Unassigned",
        camera: "Not yet classified.",
        frames: "",
        use: "These were aimed before the vocabulary existed, or under a name it does not know. Each one is either a new intent worth naming or an alias worth adding to shots.json.",
      },
      rows: loose,
    });
  }
  return groups;
}
