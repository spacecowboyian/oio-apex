// @oio/tokens — the single source of OIO brand truth.
//
// Reads tokens.json — the authority — and exposes the same named slices
// video/theme.ts historically re-exported, plus a
// fontPath() helper so any renderer can register the licensed Helvetica Neue
// faces from one canonical location instead of keeping its own copy.
//
// The brand guide was a hand-mirrored HTML file that drifted from this; it was
// removed 2026-08-11 and now renders from these values instead.

import { existsSync, readFileSync } from "node:fs";
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
 * The declared brand faces (tokens.json `type.fontFiles`) — the single list of
 * what this repo ships as real files. A CSS stack alone is not enough: Remotion
 * renders in a Chrome Headless Shell with no access to macOS system fonts, so a
 * face that is only a stack entry renders correctly in Storybook on a Mac and
 * falls back silently in real output.
 */
export const fontFaces = tokens.type.fontFiles.faces;

/** Absolute path to a declared face's file, whether or not it exists on disk. */
export const fontFilePath = (file) => join(here, tokens.type.fontFiles.dir, file);

/**
 * Absolute path to a licensed Helvetica Neue face by CSS weight.
 *
 * Kept on its original signature — `fontPath("400")` — because
 * packages/social-card and packages/video's sync-fonts script both call it that
 * way. `fontPathFor(token, weight)` is the general form.
 */
const helvetica = Object.fromEntries(
  fontFaces.filter((f) => f.token === "helvetica").map((f) => [f.weight, f.file]),
);

export const fontPath = (weight = "400") => {
  const file = helvetica[String(weight)];
  if (!file) {
    throw new Error(
      `@oio/tokens: no Helvetica Neue face for weight ${weight} (have ${Object.keys(helvetica).join(", ")})`,
    );
  }
  return fontFilePath(file);
};

/** Absolute path to any declared face, by its `token` name and CSS weight. */
export const fontPathFor = (token, weight = "400") => {
  const face = fontFaces.find((f) => f.token === token && String(f.weight) === String(weight));
  if (!face) {
    const have = fontFaces.map((f) => `${f.token}@${f.weight}`).join(", ");
    throw new Error(`@oio/tokens: no declared face ${token}@${weight} (have ${have})`);
  }
  return fontFilePath(face.file);
};

/**
 * Which declared faces are actually present on disk. Use this to fail loudly at
 * build time rather than discovering a fallback in a finished render — a
 * missing REQUIRED face should stop a render; a missing optional one should be
 * reported and degrade.
 */
export const fontStatus = () =>
  fontFaces.map((face) => ({
    ...face,
    path: fontFilePath(face.file),
    present: existsSync(fontFilePath(face.file)),
  }));

export default tokens;
