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

/**
 * Bottom scrim — a guaranteed backdrop for the corner label. Surface-aware:
 * a dark fade behind the WHITE label (surface "dark"), a light fade behind the
 * BLACK label (surface "light"). A dark scrim under a black label just muddies
 * it (the black label gets lost on the darkened photo) — the whole point is a
 * backdrop that CONTRASTS with the label, mirroring the corner-label box rule.
 * mode: "dark" | "light" | "none" (default derived from surface).
 */
function drawVignette(ctx, W, H, mode) {
  if (mode === "none") return;
  const vh = cqToken("24cqh", H);
  const top = H - vh;
  const rgb = mode === "light" ? "255,255,255" : "0,0,0";
  const grad = ctx.createLinearGradient(0, top, 0, H);
  grad.addColorStop(0, `rgba(${rgb},0)`);
  grad.addColorStop(0.45, `rgba(${rgb},0.35)`);
  grad.addColorStop(1, `rgba(${rgb},0.8)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, top, W, vh);
}

/**
 * OIO badge — solid disc, contrast-matched to what's behind it. `placement`:
 * "top-left" sits on the photo, so it inverts by surface (black on a light
 * shot, white on a dark shot). "bottom-left" sits on the bottom scrim/edge,
 * which is the OPPOSITE tone from the surface (a dark card has a dark bottom
 * scrim), so it uses the corner-label box palette — white disc on a dark card,
 * black disc on a light card — to stay legible and match the label box.
 */
function drawBadge(ctx, W, H, surface, theme, placement = "top-left") {
  const { social, colorBlack, colorWhite, cornerLabel, fontFamily } = theme;
  const diameter = cqToken(social.badgeDiameter, W);
  const offset = cqToken(social.badgeOffset, W);
  const r = diameter / 2;

  let cx, cy, discColor, textColor;
  if (placement === "bottom-left") {
    cx = offset + r;
    cy = H - offset - r;
    const palette = surface === "dark" ? cornerLabel.onDark : cornerLabel.onLight;
    discColor = palette.boxBg;
    textColor = palette.boxColor;
  } else {
    cx = offset + r;
    cy = offset + r;
    const invert = surface === "light";
    discColor = invert ? colorWhite : colorBlack;
    textColor = invert ? colorBlack : colorWhite;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = discColor;
  ctx.fill();

  const fontSize = diameter * 0.36;
  const glyphCy = -0.0175 * fontSize;
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  ctx.letterSpacing = `${0.01 * fontSize}px`;
  ctx.fillStyle = textColor;
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

/** Corner label — box on the outer edge, contrasting; plain part matches the frame.
 * `brand` prepends a small OIO disc to the lockup (consolidated attribution, no
 * separate top-left badge). */
function drawCornerLabel(ctx, W, H, { fact, name, anchor, surface, brand, centerY }, { social, cornerLabel, fontFamily }) {
  const palette = surface === "dark" ? cornerLabel.onDark : cornerLabel.onLight;
  const fontSize = cqToken(social.cornerLabelFontSize, W);
  const offset = cqToken(social.cornerLabelOffset, W);
  const maxPartWidth = cqToken(social.cornerLabelMaxPartWidth, W);

  const [padVemRaw, padHemRaw] = cornerLabel.partPadding.split(" ");
  const padV = parseFloat(padVemRaw) * fontSize;
  const padH = parseFloat(padHemRaw) * fontSize;
  const maxTextWidth = maxPartWidth - padH * 2;

  const boxOnLeft = anchor === "left";
  // ALWAYS all-caps, whatever casing the caller passes — house rule (Ian,
  // 2026-07-23), and applied BEFORE fitText because that measures and
  // ellipsizes against maxTextWidth, and caps are wider.
  const factText = fitText(ctx, (fact ?? "").toUpperCase(), fontSize, fontFamily, maxTextWidth);
  const nameText = fitText(ctx, (name ?? "").toUpperCase(), fontSize, fontFamily, maxTextWidth);

  const parts = [];
  if (factText) parts.push({ type: "text", text: factText, boxed: boxOnLeft });
  if (nameText) parts.push({ type: "text", text: nameText, boxed: !boxOnLeft });
  if (!parts.length) return;

  const partH = fontSize + padV * 2; // row height == the corner-label box height
  for (const p of parts) p.w = measurePart(ctx, p.text, fontSize, fontFamily) + padH * 2;

  // OIO disc: a circle the same height as the box (diameter = partH), placed on
  // the OUTER-corner side of the lockup — trailing for a right-anchored label
  // (lower-right corner), leading for a left-anchored one.
  const elements = [...parts];
  if (brand) {
    const disc = { type: "disc", w: partH };
    if (anchor === "right") elements.push(disc);
    else elements.unshift(disc);
  }

  const totalW = elements.reduce((s, e) => s + e.w, 0);
  // Normally the row sits `offset` up from the bottom. When `centerY` is given
  // (bottom-left badge mode), center the row's text on that line instead, so the
  // label text aligns straight across with the OIO text in the badge.
  const rowTop = typeof centerY === "number" ? centerY - partH / 2 : H - offset - partH;
  const rowLeft = anchor === "left" ? offset : W - offset - totalW;

  let x = rowLeft;
  for (const e of elements) {
    if (e.type === "disc") {
      const r = partH / 2;
      ctx.beginPath();
      ctx.arc(x + r, rowTop + r, r, 0, Math.PI * 2);
      ctx.fillStyle = palette.boxBg; // disc uses the box palette so it groups with the lockup
      ctx.fill();
      const fs = partH * 0.36;
      ctx.font = `700 ${fs}px ${fontFamily}`;
      ctx.letterSpacing = `${0.01 * fs}px`;
      ctx.fillStyle = palette.boxColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("OIO", x + r, rowTop + r - 0.0175 * fs);
      ctx.letterSpacing = "0px";
    } else {
      if (e.boxed) {
        ctx.fillStyle = palette.boxBg;
        ctx.fillRect(x, rowTop, e.w, partH);
        ctx.fillStyle = palette.boxColor;
      } else {
        ctx.fillStyle = palette.plainColor;
      }
      ctx.font = `700 ${fontSize}px ${fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(e.text, x + padH, rowTop + partH / 2);
    }
    x += e.w;
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

  // Scrim mode: explicit `vignette` prop ("dark"|"light"|"none") wins. Default:
  // dark surface (white label) gets the dark scrim to pop the label; light
  // surface (black label) gets NO scrim — the photo bottom is already light (why
  // light surface was chosen), and a dark scrim there muddies the black label
  // (Ian's call 2026-07-19). Pass `vignette: "light"` for a light-surface photo
  // whose bottom is uneven and needs a guaranteed backdrop.
  const vignetteMode = p.vignette && p.vignette !== "auto" ? p.vignette : (p.surface === "light" ? "none" : "dark");

  // Badge placement: "bottom-left" (default — normal-size disc in the bottom-left
  // corner, contrast-matched, with the corner label's text aligned across to the
  // badge's OIO glyph), "top" (legacy top-left disc on the photo), "none" (rely on
  // the platform avatar), or "corner" (fold a small OIO disc into the corner-label
  // lockup). Moved off top-left because it echoed/clashed with the platform avatar
  // (Ian, 2026-07-20).
  const badgeMode = p.badge && p.badge !== "auto" ? p.badge : "bottom-left";

  if (image) drawCoverImage(ctx, image, W, H, p.cropX, p.cropY, p.zoom, p.rotate);
  drawVignette(ctx, W, H, vignetteMode);
  if (badgeMode === "top") drawBadge(ctx, W, H, p.surface, theme, "top-left");
  else if (badgeMode === "bottom-left") drawBadge(ctx, W, H, p.surface, theme, "bottom-left");

  // With the bottom-left badge, align the corner-label text to the badge's OIO
  // glyph line (badge circle center) rather than the usual bottom offset.
  const badgeCenterY = H - cqToken(theme.social.badgeOffset, W) - cqToken(theme.social.badgeDiameter, W) / 2;
  drawCornerLabel(
    ctx,
    W,
    H,
    { ...p, brand: badgeMode === "corner", centerY: badgeMode === "bottom-left" ? badgeCenterY : undefined },
    theme,
  );
}

// Aspect table (mirror of aspects.mjs) exported for the browser tool's convenience.
export const CARD_ASPECTS = [
  { id: "square", label: "Square (1:1)", width: 1080, height: 1080, category: "instagram" },
  { id: "portrait", label: "Vertical (4:5)", width: 1080, height: 1350, category: "instagram" },
  { id: "wide", label: "Horizontal (1.91:1)", width: 1080, height: 566, category: "instagram" },
  { id: "landscape", label: "Horizontal (4:3, general crop)", width: 1080, height: 810, category: "generalCrop" },
  { id: "tall", label: "Vertical (3:4, general crop)", width: 1080, height: 1440, category: "generalCrop" },
];
