#!/usr/bin/env node
/**
 * CLI used by the oio-social-post skill to stage a batch into the inbox
 * (see social-core.mjs for the on-disk convention the generator reads).
 * Takes a JSON batch description instead of flat CLI flags because Claude
 * is the one authoring it — a JSON object is what an LLM naturally
 * produces, and it's the only way to express per-photo overrides (e.g. two
 * cards from the same batch needing different corner-label surfaces).
 *
 * Usage: node stage-inbox.mjs <batch.json>
 *
 * batch.json shape:
 * {
 *   "slug": "betty",                        // used to name the batch dir
 *   "fact": "1972 DATSUN 521",              // batch-level default
 *   "name": "BETTY",                        // batch-level default
 *   "anchor": "right",                      // batch-level default
 *   "surface": "dark",                      // batch-level default
 *   "caption": "...",
 *   "hashtags": "#OIORacing ...",
 *   "images": [
 *     { "src": "/absolute/path/to/photo1.jpg" },
 *     { "src": "/absolute/path/to/photo2.jpg", "surface": "light" }
 *   ]
 * }
 */
import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const batchJsonPath = process.argv[2];

if (!batchJsonPath) {
  console.error("Usage: node stage-inbox.mjs <batch.json>");
  process.exit(1);
}

const batch = JSON.parse(await fs.readFile(batchJsonPath, "utf-8"));
if (!batch.slug) throw new Error("batch.json needs a slug");
if (!Array.isArray(batch.images) || batch.images.length === 0) throw new Error("batch.json needs a non-empty images[]");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const batchId = `${batch.slug}-${stamp}`;
const batchDir = path.join(projectRoot, ".social-drafts", "inbox", batchId);
await fs.mkdir(batchDir, { recursive: true });

const perImageOverrides = {};
let n = 0;
for (const image of batch.images) {
  n += 1;
  const ext = path.extname(image.src) || ".jpg";
  const filename = `photo-${n}${ext}`;
  await fs.copyFile(image.src, path.join(batchDir, filename));

  const overrides = {};
  if (image.fact) overrides.fact = image.fact;
  if (image.name) overrides.name = image.name;
  if (image.anchor) overrides.anchor = image.anchor;
  if (image.surface) overrides.surface = image.surface;
  if (Object.keys(overrides).length > 0) perImageOverrides[filename] = overrides;
}

const prefill = {
  fact: batch.fact ?? "",
  name: batch.name ?? "",
  anchor: batch.anchor ?? "right",
  surface: batch.surface ?? "dark",
  caption: batch.caption ?? "",
  hashtags: batch.hashtags ?? "",
  ...(Object.keys(perImageOverrides).length > 0 ? { images: perImageOverrides } : {}),
};
await fs.writeFile(path.join(batchDir, "prefill.json"), JSON.stringify(prefill, null, 2));

console.log(JSON.stringify({ batchId, batchDir, imageCount: n }, null, 2));
