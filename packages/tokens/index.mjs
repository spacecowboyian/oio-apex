// @oio/tokens — the single source of OIO brand truth.
//
// Reads tokens.json (mirrored by hand into oio-apex-brand-guide.html; that
// mirror has drifted before — this file is authoritative) and exposes the
// same named slices video/theme.ts historically re-exported, plus a
// fontPath() helper so any renderer can register the licensed Helvetica Neue
// faces from one canonical location instead of keeping its own copy.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export const tokens = JSON.parse(readFileSync(join(here, "tokens.json"), "utf-8"));

export const color = tokens.color;
export const type = tokens.type;
export const cornerLabel = tokens.cornerLabel;
export const frame = tokens.frame;
export const social = tokens.social;
export const shape = tokens.shape;

/** Space-joined font stack for a named family, matching video/theme.ts's fontStack. */
export const fontStack = (name) => tokens.type.fonts[name].stack.join(", ");

/**
 * Absolute path to a licensed Helvetica Neue face by CSS weight.
 * These are the same TTFs the Remotion project embeds via FontFace; kept
 * here as the canonical copy so the Chrome-free renderer and the video
 * project register byte-identical faces.
 */
const FONT_FILES = {
  "400": "HelveticaNeue-Regular.ttf",
  "700": "HelveticaNeue-Bold.ttf",
};

export const fontPath = (weight = "400") => {
  const file = FONT_FILES[String(weight)];
  if (!file) throw new Error(`@oio/tokens: no Helvetica Neue face for weight ${weight} (have ${Object.keys(FONT_FILES).join(", ")})`);
  return join(here, "fonts", file);
};

export default tokens;
