import { toPng } from "html-to-image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ASPECTS, aspectById, type AspectId } from "./aspects";
import { SocialFrame, type SocialFrameFields } from "./SocialFrame";

type Photo = SocialFrameFields & {
  id: string;
  file: File;
  url: string;
};

const PREVIEW_WIDTH = 340;

const emptyFields: SocialFrameFields = {
  fact: "",
  name: "",
  anchor: "right",
  surface: "dark",
};

const sanitizeFilename = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/**
 * Storybook tool: upload any number of photos, fill in the corner-label
 * fields (fact / name / anchor / surface) per photo, and export each as a
 * brand-styled PNG sized for the social-post formats in brand guide
 * section 06 — ready to post.
 */
export const SocialPostGenerator: React.FC = () => {
  const [aspectId, setAspectId] = useState<AspectId>("landscape");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [fileInputFocused, setFileInputFocused] = useState(false);
  const exportRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const aspect = aspectById(aspectId);

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

  const updatePhoto = (id: string, patch: Partial<SocialFrameFields>) => {
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

  const exportOne = async (photo: Photo) => {
    const node = exportRefs.current.get(photo.id);
    if (!node) return;
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

  const previewScale = useMemo(() => PREVIEW_WIDTH / aspect.width, [aspect]);

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

        <div style={{ display: "flex", gap: 4, border: "1px solid #3a342c", borderRadius: 6, padding: 4 }}>
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAspectId(a.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                background: a.id === aspectId ? "#F5C200" : "transparent",
                color: a.id === aspectId ? "#000" : "#e9e5de",
                fontWeight: 700,
              }}
            >
              {a.label}
            </button>
          ))}
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
        {photos.map((photo) => (
          <div key={photo.id} style={{ width: PREVIEW_WIDTH, border: "1px solid #3a342c", borderRadius: 8, overflow: "hidden", background: "#161412" }}>
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
            />

            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
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
        ))}
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
