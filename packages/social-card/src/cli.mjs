#!/usr/bin/env node
// One-command CLI for the Chrome-free social-card pipeline.
//
//   node src/cli.mjs render <props.json> <out.png|out.jpg> [--jpeg-quality 0.9]
//   node src/cli.mjs upload <file>                 # -> prints public direct URL (Upload-Post-ready)
//
// The CLI renders and (optionally) hosts. It does NOT call Post-Bridge /
// Upload-Post — those are MCP tools the agent session holds; the CLI's job is
// to hand the agent a finished PNG/JPEG and a fetchable URL so the agent makes
// exactly one upload_photos call.
//
// props.json: { photoPath, fact, name, anchor, surface, cropX, cropY, zoom, aspectId }
// (identical shape to the legacy render-social-still.mjs, so callers swap 1:1.)

import { readFile } from "node:fs/promises";
import { renderToFile } from "./render.mjs";
import { uploadToTmpfiles } from "./upload.mjs";

function argFlag(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

async function cmdRender(args) {
  const [propsPath, outPath] = args;
  if (!propsPath || !outPath) {
    console.error("Usage: cli.mjs render <props.json> <out.png|out.jpg> [--jpeg-quality 0.9]");
    process.exit(1);
  }
  const jpegQuality = parseFloat(argFlag(args, "--jpeg-quality", "0.9"));
  const props = JSON.parse(await readFile(propsPath, "utf-8"));
  const t = Date.now();
  const r = await renderToFile(props, outPath, { jpegQuality });
  console.error(`Rendered ${r.format.toUpperCase()} ${r.width}x${r.height}, ${(r.bytes / 1024).toFixed(0)}KB in ${Date.now() - t}ms`);
  console.log(r.outPath);
}

async function cmdUpload(args) {
  const [file] = args;
  if (!file) {
    console.error("Usage: cli.mjs upload <file>");
    process.exit(1);
  }
  const { directUrl, contentType } = await uploadToTmpfiles(file);
  console.error(`Hosted (${contentType}):`);
  console.log(directUrl);
}

const [cmd, ...rest] = process.argv.slice(2);
const handlers = { render: cmdRender, upload: cmdUpload };
const handler = handlers[cmd];
if (!handler) {
  console.error(`Unknown command "${cmd ?? ""}". Commands: render, upload`);
  process.exit(1);
}
handler(rest).catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
