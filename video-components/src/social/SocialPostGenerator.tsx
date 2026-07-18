import { toPng } from "html-to-image";
import React, { useEffect, useRef, useState } from "react";
import { ASPECTS, aspectById, type AspectId } from "./aspects";
import { SocialFrame, type SocialFrameFields } from "./SocialFrame";

type Photo = SocialFrameFields & {
  id: string;
  file: File;
  url: string;
  aspectId: AspectId;
};

const PREVIEW_WIDTH = 340;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

const emptyFields: Omit<Photo, "id" | "file" | "url"> = {
  fact: "",
  name: "",
  anchor: "right",
  surface: "dark",
  cropX: 50,
  cropY: 50,
  zoom: 1,
  aspectId: "landscape",
};

const sanitizeFilename = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

type DragState = {
  photoId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCropX: number;
  startCropY: number;
  rectWidth: number;
  rectHeight: number;
};

/**
 * Storybook tool: upload any number of photos, fill in the corner-label
 * fields (fact / name / anchor / surface) per photo, adjust the crop by
 * dragging the photo and zooming, pick each photo's own export aspect, and
 * export brand-styled PNGs sized for the social-post formats in brand
 * guide section 06 — ready to post.
 */
export const SocialPostGenerator: React.FC = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [fileInputFocused, setFileInputFocused] = useState(false);
  const exportRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    const next: Photo[] = Array.from(fileList).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      url: URL.createObjectURL(file),
      ...emptyFields,
    }));
    setPhotos((prev) => [...prev, ...next]);
  };

  const updatePhoto = (id: string, patch: Partial<Photo>) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((p) => p.id !== id);
    });
    exportRefs.current.delete(id);
  };

  const onDragStart = (photo: Photo, e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      photoId: photo.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCropX: photo.cropX,
      startCropY: photo.cropY,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dxPct = ((e.clientX - drag.startClientX) / drag.rectWidth) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / drag.rectHeight) * 100;
    updatePhoto(drag.photoId, {
      cropX: clamp(drag.startCropX - dxPct, 0, 100),
      cropY: clamp(drag.startCropY - dyPct, 0, 100),
    });
  };

  const onDragEnd = () => {
    dragRef.current = null;
  };

  const exportOne = async (photo: Photo) => {
    const node = exportRefs.current.get(photo.id);
    if (!node) return;
    const aspect = aspectById(photo.aspectId);
    setExportingId(photo.id);
    try {
      const dataUrl = await toPng(node, { width: aspect.width, height: aspect.height, pixelRatio: 1 });
      const stem = sanitizeFilename(photo.fact || photo.name || photo.file.name.replace(/\.[^.]+$/, "")) || "post";
      downloadDataUrl(dataUrl, `oio-${stem}-${aspect.id}.png`);
    } finally {
      setExportingId(null);
    }
  };

  const exportAll = async () => {
    setExportingAll(true);
    try {
      for (const photo of photos) {
        // eslint-disable-next-line no-await-in-loop
        await exportOne(photo);
      }
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif", color: "#e9e5de", background: "#0d0c0a", padding: 24, minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <label
            style={{
              display: "inline-block",
              padding: "10px 16px",
              background: "#F5C200",
              color: "#000",
              fontWeight: 700,
              borderRadius: 6,
              cursor: "pointer",
              outline: fileInputFocused ? "2px solid #fff" : "2px solid transparent",
              outlineOffset: 2,
            }}
          >
            + Add photos
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                onFilesSelected(e.target.files);
                e.target.value = "";
              }}
              onFocus={() => setFileInputFocused(true)}
              onBlur={() => setFileInputFocused(false)}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0, 0, 0, 0)",
                whiteSpace: "nowrap",
                border: 0,
              }}
            />
          </label>
        </div>

        <button
          onClick={exportAll}
          disabled={photos.length === 0 || exportingAll}
          style={{
            marginLeft: "auto",
            padding: "10px 16px",
            fontWeight: 700,
            borderRadius: 6,
            border: "1px solid #3a342c",
            background: "#1e1b18",
            color: "#e9e5de",
            cursor: photos.length === 0 ? "default" : "pointer",
            opacity: photos.length === 0 ? 0.5 : 1,
          }}
        >
          {exportingAll ? "Downloading…" : `Download all (${photos.length})`}
        </button>
      </div>

      {photos.length === 0 && (
        <div style={{ color: "#9a9083", fontSize: 14 }}>No photos yet — add any number above.</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        {photos.map((photo) => {
          const aspect = aspectById(photo.aspectId);
          const previewScale = PREVIEW_WIDTH / aspect.width;
          return (
            <div key={photo.id} style={{ width: PREVIEW_WIDTH, border: "1px solid #3a342c", borderRadius: 8, overflow: "hidden", background: "#161412" }}>
              <div
                onPointerDown={(e) => onDragStart(photo, e)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                style={{ cursor: "grab", touchAction: "none" }}
                title="Drag to reposition the crop"
              >
                <SocialFrame
                  ref={(el) => {
                    if (el) exportRefs.current.set(photo.id, el);
                  }}
                  aspect={aspect}
                  imageUrl={photo.url}
                  scale={previewScale}
                  fact={photo.fact}
                  name={photo.name}
                  anchor={photo.anchor}
                  surface={photo.surface}
                  cropX={photo.cropX}
                  cropY={photo.cropY}
                  zoom={photo.zoom}
                />
              </div>

              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 4, border: "1px solid #3a342c", borderRadius: 6, padding: 4 }}>
                  {ASPECTS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => updatePhoto(photo.id, { aspectId: a.id })}
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        borderRadius: 4,
                        border: "none",
                        cursor: "pointer",
                        background: a.id === photo.aspectId ? "#F5C200" : "transparent",
                        color: a.id === photo.aspectId ? "#000" : "#e9e5de",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label htmlFor={`zoom-${photo.id}`} style={{ fontSize: 12, color: "#9a9083", width: 36 }}>
                    Zoom
                  </label>
                  <input
                    id={`zoom-${photo.id}`}
                    type="range"
                    min={ZOOM_MIN}
                    max={ZOOM_MAX}
                    step={0.05}
                    value={photo.zoom}
                    onChange={(e) => updatePhoto(photo.id, { zoom: Number(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => updatePhoto(photo.id, { cropX: 50, cropY: 50, zoom: 1 })}
                    style={{ padding: "4px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #3a342c", background: "transparent", color: "#e9e5de", cursor: "pointer" }}
                  >
                    Reset
                  </button>
                </div>

                <input
                  placeholder="Fact — year/make/model or category"
                  value={photo.fact}
                  onChange={(e) => updatePhoto(photo.id, { fact: e.target.value })}
                  style={inputStyle}
                />
                <input
                  placeholder="Name — nickname / sub-fact"
                  value={photo.name}
                  onChange={(e) => updatePhoto(photo.id, { name: e.target.value })}
                  style={inputStyle}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={photo.anchor}
                    onChange={(e) => updatePhoto(photo.id, { anchor: e.target.value as SocialFrameFields["anchor"] })}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    <option value="left">Box: left</option>
                    <option value="right">Box: right</option>
                  </select>
                  <select
                    value={photo.surface}
                    onChange={(e) => updatePhoto(photo.id, { surface: e.target.value as SocialFrameFields["surface"] })}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    <option value="dark">Photo: dark</option>
                    <option value="light">Photo: light</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => exportOne(photo)}
                    disabled={exportingId === photo.id}
                    style={{ flex: 1, padding: "8px 0", fontWeight: 700, borderRadius: 6, border: "none", background: "#F5C200", color: "#000", cursor: "pointer" }}
                  >
                    {exportingId === photo.id ? "Exporting…" : "Download PNG"}
                  </button>
                  <button
                    onClick={() => removePhoto(photo.id)}
                    style={{ padding: "8px 12px", fontWeight: 700, borderRadius: 6, border: "1px solid #3a342c", background: "transparent", color: "#e9e5de", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #3a342c",
  background: "#0d0c0a",
  color: "#e9e5de",
  fontSize: 13,
};
