// Shared, environment-agnostic OIO card drawing.
//
// Pure Canvas 2D — no fs, no @napi-rs/canvas import, no @oio/tokens import.
// Everything comes in as arguments, so the SAME code runs headless in Node
// (@napi-rs/canvas ctx, via render.mjs) and in the browser crop tool (native
// canvas ctx). One source of the brand math => preview and export can never
// drift (the exact bug class that bit the old standalone artifact).
//
// The caller passes token slices verbatim from @oio/tokens (Node) or the
// embedded tokens.json (browser); this module never re-derives a brand value.

const cqToken = (value, basis) => (parseFloat(value) / 100) * basis; // "3.2cqw" -> px

/**
 * Photo with CSS `object-fit: cover` + `object-position: cropX% cropY%` then
 * `transform: scale(zoom)` about `transform-origin: cropX% cropY%`, plus an
 * OIO-only `rotate` (degrees) about that same focal origin. rotate=0 is a
 * no-op transform, so output is byte-identical to the pre-rotate renderer.
 */
function drawCoverImage(ctx, img, W, H, cropX, cropY, zoom, rotate) {
  const iw = img.width;
  const ih = img.height;
  const base = Math.max(W / iw, H / ih); // object-fit: cover
  const baseW = iw * base;
  const baseH = ih * base;
  const x0 = (W - baseW) * (cropX / 100); // object-position
  const y0 = (H - baseH) * (cropY / 100);
  const ox = W * (cropX / 100); // transform-origin (focal point)
  const oy = H * (cropY / 100);
  const finalW = baseW * zoom;
  const finalH = baseH * zoom;
  const fx = ox + (x0 - ox) * zoom;
  const fy = oy + (y0 - oy) * zoom;

  if (rotate) {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.translate(-ox, -oy);
    ctx.drawImage(img, fx, fy, finalW, finalH);
    ctx.restore();
  } else {
    ctx.drawImage(img, fx, fy, finalW, finalH);
  }
}

/** Bottom vignette — the fixed dark backdrop for the corner label. */
function drawVignette(ctx, W, H) {
  const vh = cqToken("24cqh", H);
  const top = H - vh;
  const grad = ctx.createLinearGradient(0, top, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0.8)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, top, W, vh);
}

/** OIO badge, top-left. Solid disc, inverted (white) on a light surface. */
function drawBadge(ctx, W, surface, { social, colorBlack, colorWhite, fontFamily }) {
  const diameter = cqToken(social.badgeDiameter, W);
  const offset = cqToken(social.badgeOffset, W);
  const invert = surface === "light";
  const r = diameter / 2;
  const cx = offset + r;
  const cy = offset + r;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = invert ? colorWhite : colorBlack;
  ctx.fill();

  const fontSize = diameter * 0.36;
  const glyphCy = -0.0175 * fontSize;
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  ctx.letterSpacing = `${0.01 * fontSize}px`;
  ctx.fillStyle = invert ? colorBlack : colorWhite;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("OIO", cx, cy + glyphCy);
  ctx.letterSpacing = "0px";
}

function measurePart(ctx, text, fontSize, fontFamily) {
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

function fitText(ctx, text, fontSize, fontFamily, maxTextWidth) {
  if (measurePart(ctx, text, fontSize, fontFamily) <= maxTextWidth) return text;
  const ell = "…";
  let t = text;
  while (t.length > 1 && measurePart(ctx, t + ell, fontSize, fontFamily) > maxTextWidth) t = t.slice(0, -1);
  return t + ell;
}

/** Corner label — box on the outer edge, contrasting; plain part matches the frame. */
function drawCornerLabel(ctx, W, H, { fact, name, anchor, surface }, { social, cornerLabel, fontFamily }) {
  const palette = surface === "dark" ? cornerLabel.onDark : cornerLabel.onLight;
  const fontSize = cqToken(social.cornerLabelFontSize, W);
  const offset = cqToken(social.cornerLabelOffset, W);
  const maxPartWidth = cqToken(social.cornerLabelMaxPartWidth, W);

  const [padVemRaw, padHemRaw] = cornerLabel.partPadding.split(" ");
  const padV = parseFloat(padVemRaw) * fontSize;
  const padH = parseFloat(padHemRaw) * fontSize;
  const maxTextWidth = maxPartWidth - padH * 2;

  const boxOnLeft = anchor === "left";
  const factText = fitText(ctx, fact ?? "", fontSize, fontFamily, maxTextWidth);
  const nameText = fitText(ctx, name ?? "", fontSize, fontFamily, maxTextWidth);

  const parts = [];
  if (factText) parts.push({ text: factText, boxed: boxOnLeft });
  if (nameText) parts.push({ text: nameText, boxed: !boxOnLeft });
  if (!parts.length) return;

  const partH = fontSize + padV * 2;
  for (const p of parts) p.w = measurePart(ctx, p.text, fontSize, fontFamily) + padH * 2;
  const totalW = parts.reduce((s, p) => s + p.w, 0);

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
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    ctx.fillText(p.text, x + padH, rowTop + partH / 2);
    x += p.w;
  }
}

/**
 * Draw the full branded card onto `ctx` (sized W x H). `theme` carries the
 * token slices + a fontFamily string; `props` carries the per-card fields.
 */
export function drawCard(ctx, { image, W, H, theme, props }) {
  const { colorBlack, colorWhite } = theme;
  const p = { anchor: "right", surface: "dark", cropX: 50, cropY: 50, zoom: 1, rotate: 0, fact: "", name: "", ...props };

  ctx.fillStyle = colorBlack;
  ctx.fillRect(0, 0, W, H);

  if (image) drawCoverImage(ctx, image, W, H, p.cropX, p.cropY, p.zoom, p.rotate);
  drawVignette(ctx, W, H);
  drawBadge(ctx, W, p.surface, theme);
  drawCornerLabel(ctx, W, H, p, theme);
}

// Aspect table (mirror of aspects.mjs) exported for the browser tool's convenience.
export const CARD_ASPECTS = [
  { id: "square", label: "Square (1:1)", width: 1080, height: 1080, category: "instagram" },
  { id: "portrait", label: "Vertical (4:5)", width: 1080, height: 1350, category: "instagram" },
  { id: "wide", label: "Horizontal (1.91:1)", width: 1080, height: 566, category: "instagram" },
  { id: "landscape", label: "Horizontal (4:3, general crop)", width: 1080, height: 810, category: "generalCrop" },
  { id: "tall", label: "Vertical (3:4, general crop)", width: 1080, height: 1440, category: "generalCrop" },
];
