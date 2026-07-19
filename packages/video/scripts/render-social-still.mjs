#!/usr/bin/env node
/**
 * Headless PNG export of a single branded social card — no Storybook, no
 * browser click, no folder picker. Copies the source photo into
 * public/.tmp-social-render/ (Remotion's renderStill needs a
 * staticFile-servable asset, not an arbitrary file:// path), bundles once,
 * renders src/index.ts's "SocialCard" Still, then removes the temp copy.
 *
 * Usage: node render-social-still.mjs <props.json> <outPath.png>
 *
 * props.json shape:
 * {
 *   "photoPath": "/absolute/path/to/photo.jpg",
 *   "fact": "65 SUBURBAN",
 *   "name": "TOOTIE",
 *   "anchor": "right",
 *   "surface": "dark",
 *   "cropX": 50, "cropY": 50, "zoom": 1,
 *   "aspectId": "portrait"
 * }
 */
import fs from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const projectRoot = process.cwd();
const propsPath = process.argv[2];
const outPath = process.argv[3];

if (!propsPath || !outPath) {
  console.error("Usage: node render-social-still.mjs <props.json> <outPath.png>");
  process.exit(1);
}

const raw = JSON.parse(await fs.readFile(propsPath, "utf-8"));
const {
  photoPath,
  fact = "",
  name = "",
  anchor = "right",
  surface = "dark",
  cropX = 50,
  cropY = 50,
  zoom = 1,
  aspectId = "portrait",
} = raw;

if (!photoPath) throw new Error("props.json needs photoPath");

const tmpDir = path.join(projectRoot, "public", ".tmp-social-render");
await fs.mkdir(tmpDir, { recursive: true });
const tmpName = `render-${Date.now()}${path.extname(photoPath) || ".jpg"}`;
const tmpPublicPath = path.join(tmpDir, tmpName);
await fs.copyFile(photoPath, tmpPublicPath);

try {
  console.log("Bundling src/index.ts...");
  const bundleLocation = await bundle({ entryPoint: path.resolve(projectRoot, "src/index.ts") });

  const inputProps = {
    imagePath: `.tmp-social-render/${tmpName}`,
    fact,
    name,
    anchor,
    surface,
    cropX,
    cropY,
    zoom,
    aspectId,
  };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "SocialCard",
    inputProps,
    chromiumOptions: { ignoreCertificateErrors: true },
  });

  console.log(`Rendering ${outPath}...`);
  await renderStill({
    composition,
    serveUrl: bundleLocation,
    output: path.resolve(outPath),
    inputProps,
    imageFormat: "png",
    chromiumOptions: { ignoreCertificateErrors: true },
  });

  console.log(`Wrote ${outPath}`);
} finally {
  await fs.rm(tmpPublicPath, { force: true });
}
