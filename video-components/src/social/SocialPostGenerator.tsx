import { toPng } from "html-to-image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ASPECTS, aspectById, type AspectId } from "./aspects";
import {
  dismissInboxBatch,
  fetchAccounts,
  fetchAsFile,
  fetchInbox,
  fetchOutbox,
  inboxFileUrl,
  mimeFromFilename,
  saveOutboxBatch,
  type InboxBatch,
  type OutboxManifest,
  type SocialAccount,
} from "./socialApi";
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
 * Storybook tool: upload any number of photos (or load a batch Claude
 * staged in the inbox), fill in the corner-label fields, adjust the crop by
 * dragging and zooming, pick each photo's own export aspect, write a
 * caption, and save the finished post for Claude to publish to
 * Instagram/Facebook via Post-Bridge — see .social-drafts/ and
 * scripts/social-core.mjs for the hand-off mechanics.
 */
export const SocialPostGenerator: React.FC = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [fileInputFocused, setFileInputFocused] = useState(false);
  const exportRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragRef = useRef<DragState | null>(null);

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [inbox, setInbox] = useState<InboxBatch[]>([]);
  const [outbox, setOutbox] = useState<OutboxManifest[]>([]);
  const [loadingBatchId, setLoadingBatchId] = useState<string | null>(null);
  const [serverReachable, setServerReachable] = useState(true);

  const [selectedForPost, setSelectedForPost] = useState<Set<string>>(new Set());
  const [sourceBatchId, setSourceBatchId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [a, i, o] = await Promise.all([fetchAccounts(), fetchInbox(), fetchOutbox()]);
      setAccounts(a);
      setInbox(i);
      setOutbox(o);
      setSelectedAccountIds((prev) => (prev.size > 0 ? prev : new Set(a.filter((acc) => acc.isDefault).map((acc) => acc.id))));
      setServerReachable(true);
    } catch {
      // Storybook's dev-server middleware isn't reachable (e.g. a static
      // build) — the tool still works for manual upload/export.
      setServerReachable(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  const loadInboxBatch = async (batch: InboxBatch) => {
    setLoadingBatchId(batch.id);
    try {
      const loaded: Photo[] = await Promise.all(
        batch.images.map(async (filename) => {
          const mime = mimeFromFilename(filename);
          const file = await fetchAsFile(inboxFileUrl(batch.id, filename), filename, mime);
          const override = batch.prefill.images?.[filename];
          return {
            id: `${batch.id}-${filename}-${Math.random().toString(36).slice(2)}`,
            file,
            url: URL.createObjectURL(file),
            ...emptyFields,
            fact: override?.fact ?? batch.prefill.fact ?? "",
            name: override?.name ?? batch.prefill.name ?? "",
            anchor: override?.anchor ?? batch.prefill.anchor ?? emptyFields.anchor,
            surface: override?.surface ?? batch.prefill.surface ?? emptyFields.surface,
          };
        }),
      );
      setPhotos((prev) => [...prev, ...loaded]);
      setSelectedForPost((prev) => new Set([...prev, ...loaded.map((p) => p.id)]));
      if (batch.prefill.caption) setCaption(batch.prefill.caption);
      if (batch.prefill.hashtags) setHashtags(batch.prefill.hashtags);
      setSourceBatchId(batch.id);
    } finally {
      setLoadingBatchId(null);
    }
  };

  const dismissBatch = async (batchId: string) => {
    await dismissInboxBatch(batchId);
    setInbox((prev) => prev.filter((b) => b.id !== batchId));
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
    setSelectedForPost((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelectForPost = (id: string) => {
    setSelectedForPost((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAccount = (id: number) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  const renderPng = async (photo: Photo) => {
    const node = exportRefs.current.get(photo.id);
    if (!node) return null;
    const aspect = aspectById(photo.aspectId);
    // the captured node is the same element used for the on-screen preview, which is
    // scaled down (SocialFrame's `scale` prop) to fit PREVIEW_WIDTH — html-to-image's
    // width/height options only set the output canvas size, they don't undo that CSS
    // transform, so without this override the real content renders shrunk into the
    // top-left corner of an otherwise-blank full-size canvas. Force 1:1 for the capture.
    return toPng(node, {
      width: aspect.width,
      height: aspect.height,
      pixelRatio: 1,
      style: { transform: "none" },
    });
  };

  const exportOne = async (photo: Photo) => {
    setExportingId(photo.id);
    try {
      const dataUrl = await renderPng(photo);
      if (!dataUrl) return;
      const aspect = aspectById(photo.aspectId);
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

  const selectedPhotos = photos.filter((p) => selectedForPost.has(p.id));
  const selectedAccounts = accounts.filter((a) => selectedAccountIds.has(a.id));

  const saveForPosting = async () => {
    if (selectedPhotos.length === 0 || selectedAccounts.length === 0) return;
    setSaving(true);
    try {
      const images = [];
      for (let i = 0; i < selectedPhotos.length; i++) {
        const photo = selectedPhotos[i];
        // eslint-disable-next-line no-await-in-loop
        const dataUrl = await renderPng(photo);
        if (!dataUrl) throw new Error(`couldn't render ${photo.file.name}`);
        const stem = sanitizeFilename(photo.fact || photo.name) || `photo-${i + 1}`;
        images.push({ filename: `${i + 1}-${stem}.png`, dataUrl });
      }
      const manifest = await saveOutboxBatch({
        caption,
        hashtags,
        accounts: selectedAccounts,
        images,
        sourceBatchId,
      });
      setOutbox((prev) => [manifest, ...prev]);
      // the saved photos are now handed off — clear the composer and pull them out of the working set
      selectedPhotos.forEach((p) => {
        URL.revokeObjectURL(p.url);
        exportRefs.current.delete(p.id);
      });
      setPhotos((prev) => prev.filter((p) => !selectedForPost.has(p.id)));
      setSelectedForPost(new Set());
      setCaption("");
      setHashtags("");
      // the server deletes the consumed inbox batch too — mirror that locally so it doesn't linger in the list
      if (sourceBatchId) setInbox((prev) => prev.filter((b) => b.id !== sourceBatchId));
      setSourceBatchId(null);
    } finally {
      setSaving(false);
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

      {!serverReachable && (
        <div style={{ marginBottom: 16, padding: 10, borderRadius: 6, background: "#2a1d12", color: "#ecb37a", fontSize: 13 }}>
          Can&rsquo;t reach the local dev-server routes (inbox/outbox/accounts) — running from a static build? Manual upload
          and PNG export still work; staging and save-for-posting need `npm run storybook`.
        </div>
      )}

      {inbox.length > 0 && (
        <div style={{ marginBottom: 20, border: "1px solid #3a342c", borderRadius: 8, padding: 12, background: "#161412" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "#9a9083", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Inbox — staged by Claude ({inbox.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {inbox.map((batch) => (
              <div key={batch.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 6, background: "#0d0c0a" }}>
                <div style={{ flex: 1, fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>
                    {batch.prefill.fact || batch.prefill.name ? `${batch.prefill.fact ?? ""} ${batch.prefill.name ?? ""}`.trim() : batch.id}
                  </div>
                  <div style={{ color: "#9a9083" }}>
                    {batch.images.length} photo{batch.images.length === 1 ? "" : "s"}
                    {batch.prefill.caption ? " · caption drafted" : ""}
                  </div>
                </div>
                <button
                  onClick={() => loadInboxBatch(batch)}
                  disabled={loadingBatchId === batch.id}
                  style={{ padding: "6px 12px", fontWeight: 700, borderRadius: 6, border: "none", background: "#F5C200", color: "#000", cursor: "pointer", fontSize: 13 }}
                >
                  {loadingBatchId === batch.id ? "Loading…" : "Load"}
                </button>
                <button
                  onClick={() => dismissBatch(batch.id)}
                  style={{ padding: "6px 12px", fontWeight: 700, borderRadius: 6, border: "1px solid #3a342c", background: "transparent", color: "#e9e5de", cursor: "pointer", fontSize: 13 }}
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {photos.length === 0 && (
        <div style={{ color: "#9a9083", fontSize: 14, marginBottom: 20 }}>No photos yet — add any number above.</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 24 }}>
        {photos.map((photo) => {
          const aspect = aspectById(photo.aspectId);
          const previewScale = PREVIEW_WIDTH / aspect.width;
          const included = selectedForPost.has(photo.id);
          return (
            <div
              key={photo.id}
              style={{
                width: PREVIEW_WIDTH,
                border: included ? "1px solid #F5C200" : "1px solid #3a342c",
                borderRadius: 8,
                overflow: "hidden",
                background: "#161412",
              }}
            >
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
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  <input type="checkbox" checked={included} onChange={() => toggleSelectForPost(photo.id)} />
                  Include in post
                </label>

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

      <div style={{ border: "1px solid #3a342c", borderRadius: 8, padding: 16, background: "#161412", maxWidth: 640 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "#9a9083", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Post composer — {selectedPhotos.length} photo{selectedPhotos.length === 1 ? "" : "s"} selected
        </div>

        <textarea
          placeholder="Caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          style={{ ...inputStyle, width: "100%", resize: "vertical", marginBottom: 8, boxSizing: "border-box" }}
        />
        <input
          placeholder="#hashtags"
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          style={{ ...inputStyle, width: "100%", marginBottom: 12, boxSizing: "border-box" }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          {accounts.map((a) => (
            <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={selectedAccountIds.has(a.id)} onChange={() => toggleAccount(a.id)} />
              {a.platform} — {a.username}
            </label>
          ))}
          {accounts.length === 0 && <span style={{ fontSize: 13, color: "#9a9083" }}>No accounts loaded.</span>}
        </div>

        <button
          onClick={saveForPosting}
          disabled={saving || selectedPhotos.length === 0 || selectedAccountIds.size === 0}
          style={{
            padding: "10px 16px",
            fontWeight: 700,
            borderRadius: 6,
            border: "none",
            background: selectedPhotos.length === 0 || selectedAccountIds.size === 0 ? "#3a342c" : "#F5C200",
            color: selectedPhotos.length === 0 || selectedAccountIds.size === 0 ? "#9a9083" : "#000",
            cursor: selectedPhotos.length === 0 || selectedAccountIds.size === 0 ? "default" : "pointer",
          }}
        >
          {saving ? "Approving…" : `Approve ${selectedPhotos.length || ""}`}
        </button>
        <div style={{ fontSize: 12, color: "#9a9083", marginTop: 8 }}>
          Sends the final images + caption to Claude. Say &ldquo;post it&rdquo; when you want it published.
        </div>
      </div>

      {outbox.length > 0 && (
        <div style={{ marginTop: 20, maxWidth: 640 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "#9a9083", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Outbox
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {outbox.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 6, border: "1px solid #3a342c", fontSize: 13 }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background: m.status === "posted" ? "#1b3818" : m.status === "failed" ? "#4a110b" : "#3a342c",
                    color: m.status === "posted" ? "#94c58f" : m.status === "failed" ? "#e48378" : "#e9e5de",
                  }}
                >
                  {m.status}
                </span>
                <span style={{ flex: 1, color: "#e9e5de" }}>{m.caption || "(no caption)"}</span>
                <span style={{ color: "#9a9083" }}>{m.images.length} img · {m.accounts.map((a) => a.platform).join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
