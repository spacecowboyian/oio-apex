// Chrome-free OIO social-card renderer.
//
// Draws exactly what packages/video's SocialFrame + CornerLabel + BrandCircle
// render, but with @napi-rs/canvas instead of React-in-headless-Chrome. Every
// brand value (badge/label geometry, palettes, vignette stops, fonts) is read
// from @oio/tokens — nothing here re-derives a color/type/spacing value, same
// rule the repo enforces on the video components.
//
// CSS -> Canvas translation notes:
//   cqw = 1% of frame WIDTH, cqh = 1% of frame HEIGHT (the frame is the CSS
//   container-type: size element, so container-query units resolve against it).
//   em on a label part = that part's font-size. em on the badge glyph = the
//   badge glyph font-size (0.36 * diameter). Verified faithful against the
//   Remotion reference render — see packages/social-card/README or the
//   fidelity diff in Brains.

import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { cornerLabel as cornerLabelTokens, color, social, fontPath } from "@oio/tokens";
import { aspectById } from "./aspects.mjs";

// Register the licensed Helvetica Neue faces once, from the canonical @oio/tokens copy.
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(fontPath("400"), "Helvetica Neue");
  GlobalFonts.registerFromPath(fontPath("700"), "Helvetica Neue");
  fontsReady = true;
}

const cqToken = (value, basis) => (parseFloat(value) / 100) * basis; // "3.2cqw" -> px

/**
 * Draw the photo with CSS `object-fit: cover` + `object-position: cropX% cropY%`
 * followed by `transform: scale(zoom)` about `transform-origin: cropX% cropY%`,
 * matching SocialFrame's <img> exactly.
 */
function drawCoverImage(ctx, img, W, H, cropX, cropY, zoom) {
  const base = Math.max(W / img.width, H / img.height); // object-fit: cover
  const baseW = img.width * base;
  const baseH = img.height * base;
  // object-position: cropX% cropY% places the covered image within the frame.
  const x0 = (W - baseW) * (cropX / 100);
  const y0 = (H - baseH) * (cropY / 100);
  // then scale(zoom) about the transform-origin point (cropX% cropY% of the frame box).
  const ox = W * (cropX / 100);
  const oy = H * (cropY / 100);
  const finalW = baseW * zoom;
  const finalH = baseH * zoom;
  const fx = ox + (x0 - ox) * zoom;
  const fy = oy + (y0 - oy) * zoom;
  ctx.drawImage(img, fx, fy, finalW, finalH);
}

/** Bottom vignette — the fixed dark backdrop for the corner label (SocialFrame's gradient div). */
function drawVignette(ctx, W, H) {
  const vh = cqToken("24cqh", H); // height: 24cqh
  const top = H - vh;
  const grad = ctx.createLinearGradient(0, top, 0, H); // 180deg, top -> bottom
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0.8)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, top, W, vh);
}

/** OIO badge, top-left. BrandCircle "wordmark": solid disc, invert on light surface. */
function drawBadge(ctx, W, surface) {
  const diameter = cqToken(social.badgeDiameter, W);
  const offset = cqToken(social.badgeOffset, W);
  const invert = surface === "light"; // white disc + black text on light shots
  const r = diameter / 2;
  const cx = offset + r;
  const cy = offset + r;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = invert ? color.base.white : color.base.black;
  ctx.fill();

  const fontSize = diameter * 0.36; // GLYPH.wordmark.fontRatio
  const glyphCy = -0.0175 * fontSize; // GLYPH.wordmark.cy, em relative to glyph font-size
  ctx.font = `700 ${fontSize}px "Helvetica Neue"`;
  ctx.letterSpacing = `${0.01 * fontSize}px`;
  ctx.fillStyle = invert ? color.base.black : color.base.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("OIO", cx, cy + glyphCy);
  ctx.letterSpacing = "0px";
}

function measurePart(ctx, text, fontSize) {
  ctx.font = `700 ${fontSize}px "Helvetica Neue"`;
  return ctx.measureText(text).width;
}

/** Truncate to fit maxTextWidth with an ellipsis, mirroring CSS text-overflow: ellipsis. */
function fitText(ctx, text, fontSize, maxTextWidth) {
  if (measurePart(ctx, text, fontSize) <= maxTextWidth) return text;
  const ell = "…";
  let t = text;
  while (t.length > 1 && measurePart(ctx, t + ell, fontSize) > maxTextWidth) t = t.slice(0, -1);
  return t + ell;
}

/**
 * Corner label, bottom-right (anchor "right") or bottom-left ("left").
 * Two flush parts; the box sits on the OUTER frame edge and contrasts with
 * the surface, the plain part matches the frame color. CornerLabel palette +
 * padding + sizing all from tokens.
 */
function drawCornerLabel(ctx, W, H, { fact, name, anchor, surface }) {
  const palette = surface === "dark" ? cornerLabelTokens.onDark : cornerLabelTokens.onLight;
  const fontSize = cqToken(social.cornerLabelFontSize, W);
  const offset = cqToken(social.cornerLabelOffset, W);
  const maxPartWidth = cqToken(social.cornerLabelMaxPartWidth, W);

  // partPadding "0.32em 0.55em", em relative to the part font-size.
  const [padVemRaw, padHemRaw] = cornerLabelTokens.partPadding.split(" ");
  const padV = parseFloat(padVemRaw) * fontSize;
  const padH = parseFloat(padHemRaw) * fontSize;
  const maxTextWidth = maxPartWidth - padH * 2;

  const boxOnLeft = anchor === "left"; // box always on the outer edge
  const factBoxed = boxOnLeft;
  const nameBoxed = !boxOnLeft;

  const factText = fitText(ctx, fact ?? "", fontSize, maxTextWidth);
  const nameText = fitText(ctx, name ?? "", fontSize, maxTextWidth);

  const parts = [];
  if (factText) parts.push({ text: factText, boxed: factBoxed });
  if (nameText) parts.push({ text: nameText, boxed: nameBoxed });
  if (!parts.length) return;

  const partH = fontSize + padV * 2; // lineHeight 1 + vertical padding, both parts stretch to this
  for (const p of parts) p.w = measurePart(ctx, p.text, fontSize) + padH * 2;
  const totalW = parts.reduce((s, p) => s + p.w, 0);

  // Anchor the flush row to the chosen outer corner, sitting `offset` in.
  const rowTop = H - offset - partH;
  const rowLeft = anchor === "left" ? offset : W - offset - totalW;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let x = rowLeft;
  for (const p of parts) {
    if (p.boxed) {
      ctx.fillStyle = palette.boxBg;
      ctx.fillRect(x, rowTop, p.w, partH);
      ctx.fillStyle = palette.boxColor;
    } else {
      ctx.fillStyle = palette.plainColor;
    }
    ctx.font = `700 ${fontSize}px "Helvetica Neue"`;
    ctx.fillText(p.text, x + padH, rowTop + partH / 2);
    x += p.w;
  }
}

const DEFAULTS = { fact: "", name: "", anchor: "right", surface: "dark", cropX: 50, cropY: 50, zoom: 1, aspectId: "portrait" };

/** Render a branded card to a canvas. Returns the @napi-rs/canvas Canvas. */
export async function renderCard(props) {
  ensureFonts();
  const p = { ...DEFAULTS, ...props };
  if (!p.photoPath) throw new Error("renderCard: photoPath is required");
  const aspect = aspectById(p.aspectId);
  const { width: W, height: H } = aspect;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = color.base.black;
  ctx.fillRect(0, 0, W, H);

  const img = await loadImage(p.photoPath);
  drawCoverImage(ctx, img, W, H, p.cropX, p.cropY, p.zoom);
  drawVignette(ctx, W, H);
  drawBadge(ctx, W, p.surface);
  drawCornerLabel(ctx, W, H, p);

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
