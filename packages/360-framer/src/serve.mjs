/**
 * Local aimer server.
 *
 * The point of running this locally rather than as a hosted page: Save writes
 * aim.json straight to the working directory next to the footage, so the aim
 * lives with the clips instead of going through a download folder.
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { IH_FOV, IV_FOV, LENS_MODEL } from "./lens.mjs";
import { ClipRenderer, proofFrame } from "./proof.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, "web");
const TOKENS = path.resolve(HERE, "../../tokens/tokens.json");
const FONTS = path.resolve(HERE, "../../tokens/fonts");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
};

/** Read a JSON request body, rejecting anything absurd. */
function readJson(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > limit) { req.destroy(); reject(new Error("body too large")); }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

/**
 * Brand tokens drive the UI chrome rather than hand-picked hexes, per the
 * repo rule that anything under packages/ reads its colours from @oio/tokens.
 *
 * Elevation ladder follows DESIGN.md: Surface is the page ground, Surface 2 is
 * a raised panel. Black is reserved for the video matte behind the preview —
 * mapping the page ground to black shifts the whole ladder down and leaves
 * panels at 1.14:1 against it.
 *
 * `--edge` exists because `--line` is a hairline for dividers (1.49:1 on
 * Surface) and cannot carry an interactive boundary, which WCAG 1.4.11 wants
 * at 3:1. Steel is the token that can.
 */
async function themeCss() {
  const fallback = {
    white: "#ffffff", black: "#000000", surface: "#161412",
    surface2: "#1e1b18", line: "#3a342c", muted: "#9a9083", muted2: "#6b6355",
  };
  let base = fallback;
  let accent = "#F5C200";
  try {
    const t = JSON.parse(await readFile(TOKENS, "utf8"));
    base = { ...fallback, ...(t.color?.base ?? {}) };
    accent = t.color?.core?.spark?.ramp?.["500"] ?? accent;
  } catch {
    /* fallback values already match the token file */
  }
  return `:root{
  --ink:${base.white};
  --ground:${base.surface};
  --panel:${base.surface2};
  --matte:${base.black};
  --line:${base.line};
  --edge:${base.muted2};
  --muted:${base.muted};
  --accent:${accent};
  --on-accent:${base.black};
}
@font-face{
  font-family:"Helvetica Neue Shipped";
  src:url("/fonts/HelveticaNeue-Regular.ttf") format("truetype");
  font-weight:400; font-display:swap;
}
@font-face{
  font-family:"Helvetica Neue Shipped";
  src:url("/fonts/HelveticaNeue-Bold.ttf") format("truetype");
  font-weight:700; font-display:swap;
}`;
}

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

/**
 * Where a copied render command points by default.
 *
 * NOT next to the footage. The working drive is a slow external disk, and
 * writing a multi-gigabyte render straight to it is both slow and premature -
 * a render is a proposal until it has been looked at. So the command lands in
 * local scratch, and moving an approved file to the drive stays a deliberate
 * step rather than something a copied command does on its own.
 */
const SCRATCH = path.join(homedir(), "360-framer-renders");

/**
 * @param frames    {lens0, lens1} absolute jpg paths for the clip being aimed
 * @param aimPath   where Save writes
 * @param scrubDir  directory extractScrubFrames writes into; the filmstrip is
 *                  "ready" once scrubDir/manifest.json exists, and may still
 *                  be filling in when the server starts
 * @param clipsPath where the clip-marking (in/out/driver) list saves
 * @param clipPath  the master itself, when there is one. Without it the page
 *                  can still aim (stills are enough for that) but cannot prove
 *                  a frame, because there is nothing to seek into.
 */
export function startServer({ frames, aimPath, clipName, port = 5173, scrubDir, clipsPath, camera = null, clipPath = null }) {
  // Lens layout and seam mask are resolved once per clip and reused by every
  // proof frame; building them per request would dominate the render.
  const renderer = clipPath ? new ClipRenderer(clipPath) : null;
  let rendering = false;

  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");

      if (req.method === "POST" && url.pathname === "/aim") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
          try {
            const cfg = JSON.parse(body);
            await writeFile(aimPath, JSON.stringify(cfg, null, 2) + "\n");
            console.log(`  saved ${aimPath} (${cfg.shots?.length ?? 0} shot(s))`);
            send(res, 200, JSON.stringify({ ok: true, path: aimPath }), TYPES[".json"]);
          } catch (e) {
            send(res, 400, JSON.stringify({ ok: false, error: String(e) }), TYPES[".json"]);
          }
        });
        return;
      }

      if (url.pathname === "/aim.json") {
        try {
          send(res, 200, await readFile(aimPath, "utf8"), TYPES[".json"]);
        } catch {
          send(res, 404, "{}", TYPES[".json"]);
        }
        return;
      }

      /**
       * Render the aim on screen, through the real pipeline, and hand back the
       * picture plus the command that reproduces it at full size.
       *
       * Server-side on purpose. The browser used to assemble this command
       * itself, which made it a second implementation of `filterGraph` free to
       * drift from the one that renders - and it did: it printed placeholder
       * paths and assumed the X4's both-lenses-in-one-file layout, so on an X1
       * the command named the same lens twice. Now the page states an aim and
       * the server answers with evidence.
       *
       * `dry` skips ffmpeg and returns the command alone, which is what the
       * live command display asks for on every slider move.
       */
      if (req.method === "POST" && url.pathname === "/frame") {
        if (!renderer) {
          return send(res, 409, JSON.stringify({
            ok: false,
            error: "This session was opened from stills (--frames), so there is no clip to render from. Re-open with --input <clip.insv>.",
          }), TYPES[".json"]);
        }
        let body;
        try {
          body = await readJson(req);
        } catch (e) {
          return send(res, 400, JSON.stringify({ ok: false, error: String(e) }), TYPES[".json"]);
        }
        const dry = !!body.dry;
        // One render at a time: each is a seek into a multi-gigabyte master and
        // a full-resolution warp, so overlapping them makes every one slower
        // rather than any one sooner.
        if (!dry && rendering) {
          return send(res, 429, JSON.stringify({ ok: false, error: "A frame is already rendering." }), TYPES[".json"]);
        }
        if (!dry) rendering = true;
        try {
          const stem = path.basename(clipName, path.extname(clipName));
          const shotName = String(body.shot?.name || "aim").replace(/[^\w.-]+/g, "-");
          const r = await proofFrame(renderer, {
            shot: {
              name: shotName,
              h_fov: Number(body.shot?.h_fov),
              yaw: Number(body.shot?.yaw ?? 0),
              pitch: Number(body.shot?.pitch ?? 0),
              roll: Number(body.shot?.roll ?? 0),
              colour: body.shot?.colour ?? null,
            },
            t: Math.max(0, Number(body.t ?? 0)),
            width: Number(body.width) || 1280,
            height: Number(body.height) || 720,
            projection: body.projection ?? "sg",
            ihFov: Number(body.ih_fov ?? camera?.ihFov ?? IH_FOV),
            ivFov: Number(body.iv_fov ?? camera?.ivFov ?? IV_FOV),
            model: camera?.model ?? LENS_MODEL,
            outWidth: Number(body.out_width) || 3840,
            outHeight: Number(body.out_height) || 2160,
            outPath: path.join(SCRATCH, `${stem}_${shotName}.mp4`),
            dry,
          });
          send(res, r.error ? 500 : 200, JSON.stringify({
            ok: !r.error,
            error: r.error,
            note: r.note,
            command: r.command,
            source: r.source,
            ms: r.ms,
            image: r.jpeg ? `data:image/jpeg;base64,${r.jpeg.toString("base64")}` : null,
          }), TYPES[".json"]);
        } catch (e) {
          send(res, 500, JSON.stringify({ ok: false, error: String(e.message ?? e) }), TYPES[".json"]);
        } finally {
          if (!dry) rendering = false;
        }
        return;
      }

      if (url.pathname === "/meta.json") {
        send(res, 200, JSON.stringify({
          clip: clipName,
          clip_path: clipPath,
          can_render: !!renderer,
          frame_at: frames?.at ?? null,
          ih_fov: camera?.ihFov ?? IH_FOV,
          iv_fov: camera?.ivFov ?? IV_FOV,
          camera: camera?.id ?? null,
          camera_label: camera?.label ?? null,
          camera_confidence: camera?.confidence ?? null,
          lens_model: LENS_MODEL,
          aim_path: aimPath,
          scrub: !!scrubDir,
        }), TYPES[".json"]);
        return;
      }

      if (req.method === "POST" && url.pathname === "/clips") {
        if (!clipsPath) return send(res, 404, "no clip-marking path for this session");
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
          try {
            const cfg = JSON.parse(body);
            await writeFile(clipsPath, JSON.stringify(cfg, null, 2) + "\n");
            console.log(`  saved ${clipsPath} (${cfg.clips?.length ?? 0} clip(s))`);
            send(res, 200, JSON.stringify({ ok: true, path: clipsPath }), TYPES[".json"]);
          } catch (e) {
            send(res, 400, JSON.stringify({ ok: false, error: String(e) }), TYPES[".json"]);
          }
        });
        return;
      }

      if (url.pathname === "/clips.json") {
        try {
          send(res, 200, await readFile(clipsPath, "utf8"), TYPES[".json"]);
        } catch {
          send(res, 404, "{}", TYPES[".json"]);
        }
        return;
      }

      // The filmstrip fills in over tens of seconds to a few minutes in the
      // background; manifest.json existing IS the "ready" signal, so this is
      // deliberately a 404 rather than a placeholder while extraction runs.
      if (url.pathname === "/scrub/manifest.json") {
        if (!scrubDir) return send(res, 404, "{}", TYPES[".json"]);
        try {
          send(res, 200, await readFile(path.join(scrubDir, "manifest.json"), "utf8"), TYPES[".json"]);
        } catch {
          send(res, 404, "{}", TYPES[".json"]);
        }
        return;
      }

      const scrubMatch = url.pathname.match(/^\/scrub\/(lens0|lens1)\/(full|thumb)\/(\d+)\.jpg$/);
      if (scrubMatch) {
        if (!scrubDir) return send(res, 404, "no filmstrip for this session");
        const [, lens, kind, idxStr] = scrubMatch;
        const idx = String(Number(idxStr) + 1).padStart(4, "0"); // ffmpeg's %04d is 1-based
        try {
          send(res, 200, await readFile(path.join(scrubDir, `${lens}_${kind}_${idx}.jpg`)), TYPES[".jpg"]);
        } catch {
          send(res, 404, "missing frame");
        }
        return;
      }

      if (url.pathname === "/theme.css") {
        send(res, 200, await themeCss(), TYPES[".css"]);
        return;
      }

      // The repo ships these faces; a font that is not shipped does not exist.
      if (url.pathname.startsWith("/fonts/")) {
        const name = path.basename(url.pathname);
        if (!/^HelveticaNeue-(Regular|Bold)\.ttf$/.test(name)) return send(res, 404, "no");
        try {
          send(res, 200, await readFile(path.join(FONTS, name)), "font/ttf");
        } catch {
          send(res, 404, "missing font");
        }
        return;
      }

      if (url.pathname === "/frames/lens0.jpg" || url.pathname === "/frames/lens1.jpg") {
        const key = url.pathname.endsWith("lens0.jpg") ? "lens0" : "lens1";
        try {
          send(res, 200, await readFile(frames[key]), TYPES[".jpg"]);
        } catch {
          send(res, 404, "missing frame");
        }
        return;
      }

      // static UI
      const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
      const file = path.join(WEB, rel);
      if (!file.startsWith(WEB)) return send(res, 403, "nope");
      try {
        send(res, 200, await readFile(file), TYPES[path.extname(file)] ?? "application/octet-stream");
      } catch {
        send(res, 404, "not found");
      }
    });

    server.listen(port, () => resolve(server));
  });
}
