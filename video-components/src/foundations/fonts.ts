import { continueRender, delayRender, staticFile } from "remotion";

/**
 * Explicitly embeds Helvetica Neue instead of relying on the "Helvetica
 * Neue" system font being resolvable wherever the render happens. Storybook
 * runs in real Chrome on this Mac (fine either way), but Remotion's
 * renderStill uses a separately-downloaded "Chrome Headless Shell" binary
 * whose font matching isn't guaranteed to hit the same system font cache —
 * this is what caused the corner-label/badge text to render off-brand in
 * headless output while looking right in Storybook. Registering the real
 * face via FontFace + document.fonts makes the two paths render identically
 * regardless of host font availability. Ian confirmed OIO holds a license
 * covering this embedding, 2026-07-18 — files extracted from the licensed
 * desktop Helvetica Neue.ttc via fontTools, not redistributed as-is.
 */
const FACES: Array<{ weight: string; path: string }> = [
  { weight: "400", path: "fonts/HelveticaNeue-Regular.ttf" },
  { weight: "700", path: "fonts/HelveticaNeue-Bold.ttf" },
];

const handle = delayRender("Loading Helvetica Neue faces");

Promise.all(
  FACES.map(({ weight, path }) => new FontFace("Helvetica Neue", `url(${staticFile(path)})`, { weight }).load()),
)
  .then((faces) => faces.forEach((face) => document.fonts.add(face)))
  .catch((err) => console.error("Helvetica Neue embed failed, falling back to system font resolution", err))
  .finally(() => continueRender(handle));
