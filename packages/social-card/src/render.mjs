// Chrome-free OIO social-card renderer (Node).
//
// Thin Node wrapper around the shared, environment-agnostic card drawing in
// card-draw.mjs: loads the licensed fonts + tokens from @oio/tokens, decodes
// the photo with @napi-rs/canvas, and hands a real Canvas 2D ctx to drawCard.
// The browser crop tool runs the SAME drawCard against a native canvas, so
// preview and export can't drift. Brand values all come from @oio/tokens.

import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { cornerLabel as cornerLabelTokens, color, social, fontPath } from "@oio/tokens";
import { drawCard } from "./card-draw.mjs";
import { aspectById } from "./aspects.mjs";

const FONT_FAMILY = "Helvetica Neue";

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(fontPath("400"), FONT_FAMILY);
  GlobalFonts.registerFromPath(fontPath("700"), FONT_FAMILY);
  fontsReady = true;
}

const theme = {
  colorBlack: color.base.black,
  colorWhite: color.base.white,
  cornerLabel: cornerLabelTokens,
  social,
  fontFamily: `"${FONT_FAMILY}"`,
};

const DEFAULTS = { fact: "", name: "", anchor: "right", surface: "dark", cropX: 50, cropY: 50, zoom: 1, rotate: 0, aspectId: "portrait" };

/** Render a branded card to a canvas. Returns the @napi-rs/canvas Canvas. */
export async function renderCard(props) {
  ensureFonts();
  const p = { ...DEFAULTS, ...props };
  if (!p.photoPath) throw new Error("renderCard: photoPath is required");
  const { width: W, height: H } = aspectById(p.aspectId);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const image = await loadImage(p.photoPath);

  drawCard(ctx, { image, W, H, theme, props: p });
  return canvas;
}

/** Render and encode. Format inferred from outPath extension (.jpg/.jpeg -> JPEG q, else PNG). */
export async function renderToFile(props, outPath, { jpegQuality = 0.9 } = {}) {
  const canvas = await renderCard(props);
  const isJpeg = /\.jpe?g$/i.test(outPath);
  const buf = isJpeg
    ? await canvas.encode("jpeg", Math.round(jpegQuality * 100))
    : await canvas.encode("png");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outPath, buf);
  return { outPath, width: canvas.width, height: canvas.height, bytes: buf.length, format: isJpeg ? "jpeg" : "png" };
}
