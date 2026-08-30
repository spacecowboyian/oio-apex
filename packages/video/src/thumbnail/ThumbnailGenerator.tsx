import { toPng } from "html-to-image";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CONNECTOR_OVERLAP,
  CONNECTOR_RATIO,
  HERO_LINE_1_ATTR,
  HERO_LINE_2_ATTR,
  HERO_PRESETS,
  THUMB_HEIGHT,
  THUMB_WIDTH,
  ThumbnailFrame,
  presetById,
  type HeroPresetId,
  type ThumbnailPhotoTransform,
} from "./ThumbnailFrame";
import { color, fontStack } from "../theme";

/** Big on purpose: the guide's "never put hero text across car detail" rule
 * can't be enforced by the tool, so the preview has to make it obvious. */
const PREVIEW_WIDTH = 880;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ROTATE_MIN = -20;
const ROTATE_MAX = 20;
const SIZE_MIN = 40;
const SIZE_MAX = 320;
/** flush is called when both edges agree within this many export px */
const FLUSH_TOLERANCE = 0.1;
const MAX_SOLVE_PASSES = 6;

type Photo = ThumbnailPhotoTransform & {
  id: string;
  name: string;
  url: string;
};

const emptyTransform: ThumbnailPhotoTransform = { cropX: 50, cropY: 50, zoom: 1, rotate: 0 };

const sanitizeFilename = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

type Ink = { left: number; right: number; width: number };

let measureCtx: CanvasRenderingContext2D | null = null;
const inkContext = () => {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  return measureCtx;
};

/**
 * Real ink extents of a hero line, in export px, in the hero box's own
 * coordinate space.
 *
 * Canvas `measureText().actualBoundingBoxLeft/Right` against the element's
 * OWN computed font is the only reliable method here (process doc §1):
 * `getBoundingClientRect()` is not sufficient, because `letter-spacing:
 * -0.01em` compresses each glyph's advance without shrinking its ink, so the
 * last letter's ink can overhang the element's own box by several px. And
 * thresholding pixels of a rendered frame against the photo is worse — a
 * silver car and bright grass both read as "white text", which once drove a
 * solver to chase an overhang that was never there.
 */
const measureInk = (el: HTMLElement, translateX: number): Ink | null => {
  const ctx = inkContext();
  const text = el.textContent ?? "";
  if (!ctx || text.trim() === "") return null;
  const cs = window.getComputedStyle(el);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  // letter-spacing is a separate canvas attribute; without it the measured
  // ink is the un-tracked width and the solve lands short.
  ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
  const m = ctx.measureText(text);
  const origin = el.offsetLeft + translateX;
  const left = origin - m.actualBoundingBoxLeft;
  const right = origin + m.actualBoundingBoxRight;
  return { left, right, width: right - left };
};

type FlushReadout = {
  line1: Ink;
  line2: Ink;
  /** line 1's row span includes the connector circle when the preset has one */
  row1Right: number;
  dLeft: number;
  dRight: number;
  flush: boolean;
};

/**
 * Storybook tool: drop in a photo, level and crop it, type the two hero
 * lines, pick one of the guide's four named hero patterns, and export the
 * real 1280x720 YouTube thumbnail.
 *
 * The font-size slider is a single knob (process doc §1): it sets line 1,
 * and while "flush lock" is on the tool solves line 2's size and horizontal
 * nudge so both lines' ink edges line up exactly — the size difference
 * between the two lines is a consequence of the flush constraint, not a
 * style choice. Turn the lock off to size each line by hand.
 */
export const ThumbnailGenerator: React.FC = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileInputFocused, setFileInputFocused] = useState(false);
  const [exporting, setExporting] = useState(false);

  // design state lives outside the photo list on purpose: swapping the
  // background must not reset the text, preset, sizes or corner label.
  const [line1, setLine1] = useState("TRUCK");
  const [line2, setLine2] = useState("STUFF");
  const [preset, setPreset] = useState<HeroPresetId>("spark");
  const [size1, setSize1] = useState(133);
  const [size2, setSize2] = useState(150);
  const [dx2, setDx2] = useState(0);
  const [flushLock, setFlushLock] = useState(true);
  const [fact, setFact] = useState("1972 DATSUN 521");
  const [name, setName] = useState("BETTY");
  const [showBadge, setShowBadge] = useState(false);
  const [surface, setSurface] = useState<"dark" | "light">("dark");

  const [readout, setReadout] = useState<FlushReadout | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const solvePassRef = useRef(0);
  const solveKeyRef = useRef("");
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; cropX: number; cropY: number; w: number; h: number } | null>(null);

  const photo = photos.find((p) => p.id === selectedId) ?? null;
  const activePreset = presetById(preset);

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    const urls = photos.map((p) => p.url);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const next: Photo[] = Array.from(fileList)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        // crop/zoom/rotate are per-image state, so a photo swap can never
        // inherit the previous one's levelling rotation (process doc §4b).
        ...emptyTransform,
      }));
    if (next.length === 0) return;
    setPhotos((prev) => [...prev, ...next]);
    setSelectedId((prev) => prev ?? next[0].id);
  }, []);

  const updatePhoto = (id: string, patch: Partial<ThumbnailPhotoTransform>) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.url);
      const rest = prev.filter((p) => p.id !== id);
      setSelectedId((cur) => (cur === id ? (rest[0]?.id ?? null) : cur));
      return rest;
    });
  };

  /**
   * Converging flush solve. Each pass measures both lines' real ink, scales
   * line 2 so the two spans match, and nudges it so the left edges do —
   * re-measuring after every change rather than trusting the prediction.
   * Converges in about two passes.
   */
  useLayoutEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const el1 = node.querySelector<HTMLElement>(`[data-testid="${HERO_LINE_1_ATTR}"]`);
    const el2 = node.querySelector<HTMLElement>(`[data-testid="${HERO_LINE_2_ATTR}"]`);
    if (!el1 || !el2) {
      setReadout(null);
      return;
    }
    const ink1 = measureInk(el1, 0);
    const ink2 = measureInk(el2, dx2);
    if (!ink1 || !ink2) {
      setReadout(null);
      return;
    }

    // a connector circle inside a row counts toward that row's edge-to-edge span
    const connectorOverhang = activePreset.connector ? size1 * CONNECTOR_RATIO * (1 - CONNECTOR_OVERLAP) : 0;
    const row1Right = ink1.right + connectorOverhang;
    const span1 = row1Right - ink1.left;
    const dLeft = ink2.left - ink1.left;
    const dRight = ink2.right - row1Right;
    const flush = Math.abs(dLeft) <= FLUSH_TOLERANCE && Math.abs(dRight) <= FLUSH_TOLERANCE;

    // the lockup's script and tab are not a two-tier flush pair, so there is
    // no flush constraint to measure or solve for it
    if (activePreset.vintage) {
      setReadout(null);
      return;
    }
    setReadout({ line1: ink1, line2: ink2, row1Right, dLeft, dRight, flush });
    if (!flushLock) return;

    const key = `${line1}|${line2}|${size1}|${preset}|${flushLock}`;
    if (key !== solveKeyRef.current) {
      solveKeyRef.current = key;
      solvePassRef.current = 0;
    }
    if (flush || solvePassRef.current >= MAX_SOLVE_PASSES) return;
    solvePassRef.current += 1;

    const k = span1 / ink2.width;
    const nextSize2 = clamp(size2 * k, 8, 600);
    // ink offsets scale linearly with font-size, so predict line 2's new left
    // bearing, then translate it onto line 1's left edge.
    const predictedLeftBearing = (ink2.left - (el2.offsetLeft + dx2)) * (nextSize2 / size2);
    const nextDx2 = ink1.left - (el2.offsetLeft + predictedLeftBearing);
    setSize2(nextSize2);
    setDx2(nextDx2);
  }, [line1, line2, size1, size2, dx2, preset, flushLock, activePreset, fontsReady]);

  // the vintage lockup is one unit: the knob sizes the script, and the tab
  // derives from it inside the frame at the guide's own ratio.
  useEffect(() => {
    if (flushLock && activePreset.vintage) setSize2(size1);
  }, [flushLock, activePreset, size1]);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!photo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      cropX: photo.cropX,
      cropY: photo.cropY,
      w: rect.width,
      h: rect.height,
    };
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !photo || drag.pointerId !== e.pointerId) return;
    const dxPct = ((e.clientX - drag.startX) / drag.w) * 100;
    const dyPct = ((e.clientY - drag.startY) / drag.h) * 100;
    updatePhoto(photo.id, {
      cropX: clamp(drag.cropX - dxPct, 0, 100),
      cropY: clamp(drag.cropY - dyPct, 0, 100),
    });
  };

  const onDragEnd = () => {
    dragRef.current = null;
  };

  const exportPng = async () => {
    const node = frameRef.current;
    if (!node) return;
    setExporting(true);
    try {
      // the captured node is the same element the preview scales down, and
      // html-to-image's width/height only size the output canvas — they don't
      // undo the CSS transform, so force 1:1 for the capture.
      const dataUrl = await toPng(node, {
        width: THUMB_WIDTH,
        height: THUMB_HEIGHT,
        pixelRatio: 1,
        style: { transform: "none" },
      });
      const stem = sanitizeFilename([line1, line2].join("-") || fact || name) || "thumbnail";
      downloadDataUrl(dataUrl, `oio-thumb-${stem}-1280x720.png`);
    } finally {
      setExporting(false);
    }
  };

  const previewScale = PREVIEW_WIDTH / THUMB_WIDTH;

  return (
    <div style={{ fontFamily: fontStack("helvetica"), color: color.base.white, background: "#0d0c0a", padding: 24, minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            title={photo ? "Drag to reposition the crop — or drop a new photo here" : "Drop a photo here"}
            style={{
              cursor: photo ? "grab" : "default",
              touchAction: "none",
              outline: dragOver ? `2px solid ${color.core.spark.ramp[500]}` : `1px solid ${color.base.line}`,
              width: PREVIEW_WIDTH,
            }}
          >
            <ThumbnailFrame
              ref={frameRef}
              imageUrl={photo?.url ?? null}
              scale={previewScale}
              line1={line1}
              line2={line2}
              preset={preset}
              size1={size1}
              size2={size2}
              dx2={dx2}
              fact={fact}
              name={name}
              showBadge={showBadge}
              surface={surface}
              cropX={photo?.cropX ?? emptyTransform.cropX}
              cropY={photo?.cropY ?? emptyTransform.cropY}
              zoom={photo?.zoom ?? emptyTransform.zoom}
              rotate={photo?.rotate ?? emptyTransform.rotate}
              line1InkRight={readout ? readout.line1.right : null}
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label
              style={{
                display: "inline-block",
                padding: "10px 16px",
                background: color.core.spark.ramp[500],
                color: color.base.black,
                fontWeight: 700,
                cursor: "pointer",
                outline: fileInputFocused ? `2px solid ${color.base.white}` : "2px solid transparent",
                outlineOffset: 2,
              }}
            >
              + Add photo
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
                onFocus={() => setFileInputFocused(true)}
                onBlur={() => setFileInputFocused(false)}
                style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}
              />
            </label>
            <button
              onClick={exportPng}
              disabled={exporting}
              style={{ padding: "10px 16px", fontWeight: 700, border: `1px solid ${color.base.line}`, background: color.base.surface2, color: color.base.white, cursor: "pointer" }}
            >
              {exporting ? "Exporting…" : "Download PNG (1280×720)"}
            </button>
            <span style={{ fontSize: 12, color: color.base.muted }}>
              Drop a photo anywhere on the frame. Hero text never across car detail — check it here.
            </span>
          </div>

          {photos.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {photos.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", border: p.id === selectedId ? `1px solid ${color.core.spark.ramp[500]}` : `1px solid ${color.base.line}`, fontSize: 12 }}>
                  <button
                    onClick={() => setSelectedId(p.id)}
                    style={{ border: "none", background: "transparent", color: p.id === selectedId ? color.core.spark.ramp[500] : color.base.white, cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => removePhoto(p.id)}
                    aria-label={`Remove ${p.name}`}
                    style={{ border: "none", background: "transparent", color: color.base.muted, cursor: "pointer" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 360 }}>
          <Panel title="Photo">
            {photo ? (
              <>
                <Slider
                  id="zoom"
                  label="Zoom"
                  min={ZOOM_MIN}
                  max={ZOOM_MAX}
                  step={0.01}
                  value={photo.zoom}
                  onChange={(v) => updatePhoto(photo.id, { zoom: v })}
                  format={(v) => `${v.toFixed(2)}×`}
                />
                <Slider
                  id="rotate"
                  label="Level"
                  min={ROTATE_MIN}
                  max={ROTATE_MAX}
                  step={0.1}
                  value={photo.rotate}
                  onChange={(v) => updatePhoto(photo.id, { rotate: v })}
                  format={(v) => `${v.toFixed(1)}°`}
                />
                <button
                  onClick={() => updatePhoto(photo.id, emptyTransform)}
                  style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${color.base.line}`, background: "transparent", color: color.base.white, cursor: "pointer" }}
                >
                  Reset crop / zoom / level
                </button>
              </>
            ) : (
              <div style={{ fontSize: 13, color: color.base.muted }}>No photo yet — add or drop one.</div>
            )}
          </Panel>

          <Panel title="Hero">
            <input placeholder="Line 1" value={line1} onChange={(e) => setLine1(e.target.value)} style={inputStyle} />
            <input placeholder="Line 2" value={line2} onChange={(e) => setLine2(e.target.value)} style={inputStyle} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {HERO_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  title={p.mood}
                  style={{
                    flex: "1 0 45%",
                    padding: "8px 6px",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 12,
                    textTransform: "uppercase",
                    background: p.id === preset ? color.core.spark.ramp[500] : "transparent",
                    color: p.id === preset ? color.base.black : color.base.white,
                    outline: p.id === preset ? "none" : `1px solid ${color.base.line}`,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: color.base.muted }}>{activePreset.mood}</div>

            <Slider
              id="size1"
              label="Size"
              min={SIZE_MIN}
              max={SIZE_MAX}
              step={0.5}
              value={size1}
              onChange={(v) => setSize1(v)}
              format={(v) => `${v.toFixed(1)}px`}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={flushLock} onChange={(e) => setFlushLock(e.target.checked)} />
              Flush lock — solve line 2 from line 1
            </label>
            {!flushLock && (
              <Slider
                id="size2"
                label={activePreset.vintage ? "Script" : "Size 2"}
                min={SIZE_MIN}
                max={activePreset.vintage ? 900 : SIZE_MAX * 2}
                step={0.5}
                value={size2}
                onChange={(v) => setSize2(v)}
                format={(v) => `${v.toFixed(1)}px`}
              />
            )}
            {!flushLock && (
              <Slider
                id="dx2"
                label="Nudge"
                min={-200}
                max={200}
                step={0.5}
                value={dx2}
                onChange={(v) => setDx2(v)}
                format={(v) => `${v.toFixed(1)}px`}
              />
            )}
            <div data-testid="flush-readout" style={{ fontSize: 11, fontFamily: fontStack("mono"), color: readout?.flush ? color.support.flag.ramp[300] : color.base.muted, lineHeight: 1.5 }}>
              {readout ? (
                <>
                  L1 ink {readout.line1.left.toFixed(2)} → {readout.row1Right.toFixed(2)} ({(readout.row1Right - readout.line1.left).toFixed(2)}px) @ {size1.toFixed(1)}px
                  <br />
                  L2 ink {readout.line2.left.toFixed(2)} → {readout.line2.right.toFixed(2)} ({readout.line2.width.toFixed(2)}px) @ {size2.toFixed(1)}px
                  <br />
                  Δleft {readout.dLeft.toFixed(3)} · Δright {readout.dRight.toFixed(3)} · {readout.flush ? "FLUSH" : "solving…"}
                </>
              ) : activePreset.vintage ? (
                "vintage lockup — one unit, no two-tier flush constraint"
              ) : (
                "no hero text to measure"
              )}
            </div>
          </Panel>

          <Panel title="Corner label">
            <input placeholder="Year + model — e.g. 1972 DATSUN 521" value={fact} onChange={(e) => setFact(e.target.value)} style={inputStyle} />
            <input placeholder="Nickname — e.g. BETTY" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            <select value={surface} onChange={(e) => setSurface(e.target.value as "dark" | "light")} style={inputStyle}>
              <option value="dark">Photo: dark</option>
              <option value="light">Photo: light</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={showBadge} onChange={(e) => setShowBadge(e.target.checked)} />
              OIO badge — only when a human is on camera
            </label>
          </Panel>
        </div>
      </div>
    </div>
  );
};

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ border: `1px solid ${color.base.line}`, background: color.base.surface, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ fontWeight: 700, fontSize: 12, color: color.base.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
    {children}
  </div>
);

const Slider: React.FC<{
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}> = ({ id, label, min, max, step, value, onChange, format }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <label htmlFor={id} style={{ fontSize: 12, color: color.base.muted, width: 46 }}>
      {label}
    </label>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
    <span style={{ fontSize: 11, fontFamily: fontStack("mono"), color: color.base.muted, width: 56, textAlign: "right" }}>{format(value)}</span>
  </div>
);

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: `1px solid ${color.base.line}`,
  background: "#0d0c0a",
  color: color.base.white,
  fontSize: 13,
};
