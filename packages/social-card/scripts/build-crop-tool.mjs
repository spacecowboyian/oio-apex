#!/usr/bin/env node
// Build the self-contained OIO Card Cropper HTML artifact.
//
// Inlines, into crop-tool/template.html:
//   - tokens.json          (brand values, from @oio/tokens)
//   - card-draw.mjs        (the SAME draw code the headless renderer uses —
//                           injected verbatim so the tool can never fork/drift)
//   - Helvetica Neue TTFs   (base64 data URIs, so the exported card is brand-exact)
//
// Writes crop-tool/oio-crop-tool.html, ready to publish with the Artifact tool.
// Fonts are read + encoded here (never through model context), same discipline
// as the embed-photos pattern.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fontPath, tokens } from "@oio/tokens";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");

const template = await readFile(join(pkg, "crop-tool", "template.html"), "utf-8");

// card-draw.mjs verbatim, with ESM `export ` stripped so its declarations land
// in the artifact's module scope.
const cardDraw = (await readFile(join(pkg, "src", "card-draw.mjs"), "utf-8")).replace(/^export /gm, "");

const fontRegular = (await readFile(fontPath("400"))).toString("base64");
const fontBold = (await readFile(fontPath("700"))).toString("base64");

let html = template;
if (!html.includes("/*__TOKENS__*/ null")) throw new Error("template missing /*__TOKENS__*/ null placeholder");
if (!html.includes("/*__CARD_DRAW__*/")) throw new Error("template missing /*__CARD_DRAW__*/ placeholder");
html = html.replace("/*__TOKENS__*/ null", JSON.stringify(tokens));
html = html.replace("/*__CARD_DRAW__*/", cardDraw);
html = html.replace("__FONT_REGULAR_B64__", fontRegular);
html = html.replace("__FONT_BOLD_B64__", fontBold);

if (html.includes("__FONT_REGULAR_B64__") || html.includes("__FONT_BOLD_B64__")) {
  throw new Error("font placeholders not fully replaced");
}

const outPath = join(pkg, "crop-tool", "oio-crop-tool.html");
await writeFile(outPath, html);
console.log(`Wrote ${outPath} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
