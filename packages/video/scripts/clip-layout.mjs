#!/usr/bin/env node
/**
 * Clip Layout — a local browser tool for ordering a set of clips and framing
 * each one inside a vertical (or any-aspect) delivery frame.
 *
 * Not tied to the leaderboard, or to any one event: point it at a folder of
 * clips, give it a frame size and optionally a safe area, and it gives you
 * back a `layout.json` describing the running order and a per-clip crop
 * rectangle in SOURCE pixels — i.e. exactly the numbers `ffmpeg -vf crop=`
 * wants, and close enough to Resolve's transform to set by hand.
 *
 * It deliberately does NOT render video. Deciding the framing and executing
 * the edit are separate jobs; this only does the deciding, so it stays useful
 * whether the edit gets finished in ffmpeg, Resolve, or anywhere else.
 *
 *   node scripts/clip-layout.mjs <clips-dir> [options]
 *
 *     --out <path>        layout JSON to read/write   (default <clips-dir>/layout.json)
 *     --frames <n>        thumbnails per clip         (default 10)
 *     --frame <WxH>       delivery frame              (default 1080x1920)
 *     --safe-top <px>     top safe band, in frame px  (default 0)
 *     --safe-bottom <px>  bottom safe band            (default 0)
 *     --safe-left <px>    left safe band              (default 0)
 *     --safe-right <px>   right safe band             (default 0)
 *     --overlay <path>    PNG to show over the stage (e.g. a leaderboard still)
 *     --speed <n>         playback speed of the clips, e.g. 0.2 for 20% (default 1)
 *     --card <s>          default seconds each clip is on screen (default 8)
 *     --port <n>          (default 5173)
 *
 * With `--speed` set, each clip only needs `card / speed` seconds of source.
 * You pick the CENTRE of that window by scrubbing the clip's own timeline; the
 * in/out points follow from the centre, the card length and the speed, so the
 * thing you're choosing is "what moment is this shot about" rather than
 * arithmetic.
 *
 * Existing layout.json is loaded on start, so re-running resumes where you
 * left off. Thumbnails are cached in `.clip-layout/` beside the clips and
 * keyed on size+mtime, so a re-run is instant unless a clip actually changed.
 */
import http from "node:http";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const VIDEO_EXT = new Set([".mov", ".mp4", ".m4v", ".mkv", ".avi", ".mts", ".webm"]);

const argv = process.argv.slice(2);
const clipsDir = argv.find((a) => !a.startsWith("--"));
if (!clipsDir) {
  console.error("usage: node scripts/clip-layout.mjs <clips-dir> [--frame 1080x1920] [--safe-top 1020] ...");
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const num = (name, fallback) => Number(opt(name, fallback));

const root = path.resolve(clipsDir);
const outPath = path.resolve(opt("out", path.join(root, "layout.json")));
const cacheDir = path.join(root, ".clip-layout");
const thumbCount = num("frames", 10);
const [frameW, frameH] = String(opt("frame", "1080x1920")).split("x").map(Number);
const safe = {
  top: num("safe-top", 0),
  bottom: num("safe-bottom", 0),
  left: num("safe-left", 0),
  right: num("safe-right", 0),
};
const overlayPath = opt("overlay", null);
const speed = Number(opt("speed", 1)) || 1;
const cardSeconds = Number(opt("card", 8)) || 8;
const port = num("port", 5173);

const probe = async (file) => {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate:format=duration:format_tags=creation_time",
    "-of", "json",
    file,
  ]);
  const j = JSON.parse(stdout);
  const s = j.streams?.[0] ?? {};
  const [n, d] = String(s.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    width: s.width ?? 0,
    height: s.height ?? 0,
    fps: d ? n / d : 0,
    duration: Number(j.format?.duration ?? 0),
    // the camera's own creation stamp when it wrote one — more trustworthy
    // than the filesystem, which gets rewritten by copying off a card
    mediaCreated: Date.parse(j.format?.tags?.creation_time ?? "") || 0,
  };
};

/**
 * Default running order. Per Ian: shooting order (oldest first) is the right
 * starting point — it's the order the day actually happened in — UNLESS the
 * filenames already encode a deliberate order, in which case someone has
 * already made this decision and we shouldn't override it.
 *
 * "Already encode an order" means a leading number on at least two files that
 * aren't all the same (`01_prep_...`, `02_...`). A camera's own `IMG_0042`
 * doesn't count — the digits aren't leading — which is what we want, since
 * those should fall through to timestamps.
 *
 * Creation time prefers the media's own `creation_time` tag over the file's
 * birthtime, because copying footage off a card rewrites the filesystem dates
 * and flattens everything to the copy time. Note a camera with a wrong clock
 * (the X1 in this project's own footage stamps 2018) will sort wrong here —
 * the UI reports which basis it used so that's visible rather than silent.
 */
const leadingNumber = (name) => {
  const m = /^(\d+)/.exec(name);
  return m ? Number(m[1]) : null;
};

const defaultOrder = (clips) => {
  const numbered = clips.filter((c) => leadingNumber(c.name) !== null);
  const distinct = new Set(numbered.map((c) => leadingNumber(c.name)));
  if (numbered.length >= 2 && distinct.size > 1) {
    return {
      basis: "filename",
      clips: [...clips].sort(
        (a, b) =>
          (leadingNumber(a.name) ?? Number.POSITIVE_INFINITY) - (leadingNumber(b.name) ?? Number.POSITIVE_INFINITY) ||
          a.name.localeCompare(b.name, undefined, { numeric: true }),
      ),
    };
  }
  return {
    basis: "created",
    clips: [...clips].sort((a, b) => a.created - b.created || a.name.localeCompare(b.name, undefined, { numeric: true })),
  };
};

/** Even samples across the clip, skipping the very first and last frame —
 * both are routinely a black or half-exposed frame on phone footage, and a
 * black thumbnail tells you nothing about how to frame the shot. */
const extractThumbs = async (file, info, destDir) => {
  await fs.mkdir(destDir, { recursive: true });
  const jobs = [];
  for (let i = 0; i < thumbCount; i++) {
    const t = info.duration * ((i + 0.5) / thumbCount);
    const out = path.join(destDir, `${String(i).padStart(3, "0")}.jpg`);
    jobs.push(
      run("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", out]),
    );
  }
  await Promise.all(jobs);
};

const buildIndex = async () => {
  const names = (await fs.readdir(root))
    .filter((n) => !n.startsWith(".") && VIDEO_EXT.has(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const clips = [];
  for (const name of names) {
    const file = path.join(root, name);
    const st = await fs.stat(file);
    const info = await probe(file);
    const key = `${name}-${st.size}-${Math.round(st.mtimeMs)}`;
    const destDir = path.join(cacheDir, key);
    const have = await fs
      .readdir(destDir)
      .then((f) => f.filter((x) => x.endsWith(".jpg")).length)
      .catch(() => 0);
    if (have < thumbCount) {
      process.stdout.write(`  thumbnails: ${name}\n`);
      await extractThumbs(file, info, destDir);
    }
    clips.push({
      name,
      key,
      ...info,
      created: info.mediaCreated || st.birthtimeMs || st.mtimeMs,
      createdFrom: info.mediaCreated ? "media" : st.birthtimeMs ? "file birthtime" : "file mtime",
      thumbs: thumbCount,
    });
  }
  return clips;
};

const loadLayout = async () => {
  try {
    return JSON.parse(await fs.readFile(outPath, "utf-8"));
  } catch {
    return null;
  }
};

console.log(`Clip Layout — ${root}`);
const indexed = await buildIndex();
if (!indexed.length) {
  console.error("no video files found in that folder");
  process.exit(1);
}
const { basis: orderBasis, clips } = defaultOrder(indexed);
const saved = await loadLayout();
console.log(`  ${clips.length} clips, ${thumbCount} frames each — default order: ${orderBasis === "filename" ? "filename numbering" : "creation time, oldest first"}`);

// read per request, not once at boot — this is a local tool you'll want to
// tweak, and a cached-at-startup UI means edits silently do nothing until you
// remember to restart the server. It's one small file off local disk.
const uiUrl = new URL("./clip-layout-ui.html", import.meta.url);

const send = (res, code, type, body) => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname === "/") return send(res, 200, "text/html; charset=utf-8", await fs.readFile(uiUrl, "utf-8"));

    if (url.pathname === "/api/state") {
      return send(
        res,
        200,
        "application/json",
        JSON.stringify({
          dir: root,
          outPath,
          frame: { width: frameW, height: frameH },
          safe,
          hasOverlay: Boolean(overlayPath),
          speed,
          cardSeconds,
          orderBasis,
          clips,
          saved,
        }),
      );
    }

    // Range support is what makes seeking work — without it Chrome downloads
    // the whole file before it will scrub, which on a 58s 120fps clip is a
    // long wait per seek.
    if (url.pathname === "/clip") {
      const name = path.basename(url.searchParams.get("name") ?? "");
      const file = path.join(root, name);
      const stat = await fs.stat(file);
      const range = req.headers.range;
      const type = name.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/quicktime";
      if (!range) {
        res.writeHead(200, { "content-type": type, "content-length": stat.size, "accept-ranges": "bytes" });
        return fsSync.createReadStream(file).pipe(res);
      }
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = Number(startStr);
      const end = endStr ? Number(endStr) : Math.min(start + 4 * 1024 * 1024, stat.size - 1);
      res.writeHead(206, {
        "content-type": type,
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "accept-ranges": "bytes",
        "content-length": end - start + 1,
      });
      return fsSync.createReadStream(file, { start, end }).pipe(res);
    }

    if (url.pathname === "/thumb") {
      const key = url.searchParams.get("key");
      const i = String(Number(url.searchParams.get("i") ?? 0)).padStart(3, "0");
      // path is rebuilt from a known-good cache key + a numeric index, so a
      // crafted query can't walk out of the cache directory
      const p = path.join(cacheDir, path.basename(key ?? ""), `${i}.jpg`);
      return send(res, 200, "image/jpeg", await fs.readFile(p));
    }

    if (url.pathname === "/overlay" && overlayPath) {
      return send(res, 200, "image/png", await fs.readFile(path.resolve(overlayPath)));
    }

    if (url.pathname === "/api/save" && req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      // Keep the previous version before clobbering it. A layout is somebody's
      // decisions — an hour of scrubbing and framing — and a single stray Save
      // (or a tool being driven by someone testing it) shouldn't be able to
      // destroy that with no way back. `.bak` is the immediately-previous
      // save; `.history/` keeps the ones before that.
      try {
        const prev = await fs.readFile(outPath, "utf-8");
        const histDir = path.join(path.dirname(outPath), ".clip-layout-history");
        await fs.mkdir(histDir, { recursive: true });
        const st = await fs.stat(outPath);
        const stamp = new Date(st.mtimeMs).toISOString().replace(/[:.]/g, "-");
        await fs.writeFile(path.join(histDir, `${path.basename(outPath, ".json")}-${stamp}.json`), prev);
        await fs.writeFile(`${outPath}.bak`, prev);
      } catch {
        // no existing file — nothing to preserve
      }
      await fs.writeFile(outPath, JSON.stringify(body, null, 2) + "\n");
      console.log(`  saved ${outPath} (previous kept as .bak + .clip-layout-history/)`);
      return send(res, 200, "application/json", JSON.stringify({ ok: true, outPath }));
    }

    send(res, 404, "text/plain", "not found");
  } catch (err) {
    send(res, 500, "text/plain", String(err?.message ?? err));
  }
});

server.listen(port, () => {
  console.log(`\n  open  http://localhost:${port}\n`);
});
