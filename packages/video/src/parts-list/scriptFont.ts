import { continueRender, delayRender, staticFile } from "remotion";
import tokens from "@oio/tokens/tokens.json";

/**
 * Registers the brand's vintage script (SignPainter) as a real embedded face,
 * for the same reason `foundations/fonts.ts` embeds Helvetica Neue rather than
 * trusting the system to resolve it: Remotion renders in a separately
 * downloaded Chrome Headless Shell whose font matching does NOT see this Mac's
 * installed fonts. That mismatch is exactly what shipped off-brand
 * corner-label/badge text once already (see fonts.ts's own note).
 *
 * SignPainter is a macOS system font and is NOT currently in the repo, so this
 * load will fail until the licensed file is dropped in as
 * `public/fonts/SignPainter.ttf` (and mirrored into `packages/tokens/fonts/`
 * alongside the Helvetica faces, which is where brand font truth lives). Until
 * then the hero total falls back down the CSS stack — in a headless render that
 * means a generic serif, which is wrong and silent. `SCRIPT_FACE` lets callers
 * surface that instead of shipping it unnoticed; the Playground story prints it.
 *
 * The load is deliberately NOT wrapped in delayRender's failure path — a
 * missing optional font must not fail a render, only degrade it visibly.
 */

export const SCRIPT_FAMILY = "OIO SignPainter";

/** CSS stack: the embedded face first, then the macOS system names the brand
 * guide's own `.font-sign` rule uses, then a generic. Matches the guide rather
 * than inventing a different fallback chain. */
export const SCRIPT_STACK = `"${SCRIPT_FAMILY}", "SignPainter-HouseScript", "SignPainter", "Brush Script MT", "Apple Chancery", cursive`;

export type ScriptFaceState = "loading" | "embedded" | "fallback";

let state: ScriptFaceState = "loading";
/** Whether the embedded script face is available. `"fallback"` means the hero
 * total is rendering in something that is not the brand face. */
export const scriptFaceState = (): ScriptFaceState => state;

const handle = delayRender("Loading OIO SignPainter");

/** filename comes from the tokens manifest (`type.fontFiles`), so the face is
 * declared in exactly one place — the same entry `npm run sync-fonts` copies
 * and `fontStatus()` reports on. */
const scriptFace = tokens.type.fontFiles.faces.find((f) => f.token === "signPainter");
const scriptFile = scriptFace ? scriptFace.file : "SignPainter.ttf";

new FontFace(SCRIPT_FAMILY, `url(${staticFile(`fonts/${scriptFile}`)})`)
  .load()
  .then((face) => {
    document.fonts.add(face);
    state = "embedded";
  })
  .catch(() => {
    state = "fallback";
    console.warn(
      `[parts-list] SignPainter is not embedded (public/fonts/${scriptFile} missing) — ` +
        "the hero total will render in a fallback face. Headless renders do not see macOS " +
        "system fonts, so this affects real output, not just the preview.",
    );
  })
  .finally(() => continueRender(handle));
