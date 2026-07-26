#!/usr/bin/env node
/**
 * Copies every brand face declared in `@oio/tokens` (tokens.json
 * `type.fontFiles`) into `packages/video/public/fonts/`, where Remotion's
 * `staticFile()` can reach them.
 *
 * Why this exists rather than just relying on the CSS stack: Remotion renders
 * in a separately-downloaded Chrome Headless Shell that cannot see macOS
 * system fonts. A face that is only a stack entry looks right in Storybook on
 * a Mac and silently falls back in real output — the exact mismatch that once
 * shipped off-brand corner-label text (see src/foundations/fonts.ts).
 *
 * Exits non-zero if a REQUIRED face is missing, so a broken font setup stops a
 * build instead of surfacing as a wrong-looking render. Optional faces are
 * reported and skipped.
 *
 *   npm run sync-fonts            # copy what's there, report what isn't
 *   npm run sync-fonts -- --check # report only, copy nothing (CI / pre-render)
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fontStatus } from "@oio/tokens";

const here = dirname(fileURLToPath(import.meta.url));
const publicFonts = join(here, "..", "public", "fonts");
const checkOnly = process.argv.includes("--check");

if (!checkOnly) mkdirSync(publicFonts, { recursive: true });

let missingRequired = 0;
let missingOptional = 0;
let copied = 0;

for (const face of fontStatus()) {
  const label = `${face.family} ${face.weight}`;
  if (!face.present) {
    if (face.required) {
      missingRequired++;
      console.error(`MISSING (required)  ${label} — expected ${face.path}`);
    } else {
      missingOptional++;
      console.warn(`missing (optional)  ${label} — ${face.file}`);
      if (face.missingEffect) console.warn(`                    effect: ${face.missingEffect}`);
      if (face.source) console.warn(`                    source: ${face.source}`);
    }
    continue;
  }
  const dest = join(publicFonts, face.file);
  if (checkOnly) {
    console.log(`ok                  ${label} (${(statSync(face.path).size / 1024).toFixed(0)} KB)`);
    continue;
  }
  copyFileSync(face.path, dest);
  copied++;
  console.log(`copied              ${label} → public/fonts/${face.file}`);
}

if (missingOptional) {
  console.warn(
    `\n${missingOptional} optional face(s) missing. Renders will fall back for those — ` +
      `see packages/tokens/fonts/README.md for how to extract them.`,
  );
}
if (missingRequired) {
  console.error(`\n${missingRequired} REQUIRED face(s) missing — renders would be off-brand. Aborting.`);
  process.exit(1);
}
if (!checkOnly) console.log(`\n${copied} face(s) in place.`);
