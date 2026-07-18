// Fetch wrappers for the /social/* routes registered by
// .storybook/social-middleware.mjs — same-origin, nothing to configure.
// See scripts/social-core.mjs for what each route actually does on disk.

export type SocialAccount = {
  id: number;
  platform: string;
  username: string;
  isDefault?: boolean;
};

export type InboxImageOverride = {
  fact?: string;
  name?: string;
  anchor?: "left" | "right";
  surface?: "dark" | "light";
};

export type InboxPrefill = {
  fact?: string;
  name?: string;
  anchor?: "left" | "right";
  surface?: "dark" | "light";
  caption?: string;
  hashtags?: string;
  note?: string;
  /** per-photo overrides of the batch-level defaults above, keyed by filename */
  images?: Record<string, InboxImageOverride>;
};

export type InboxBatch = {
  id: string;
  prefill: InboxPrefill;
  images: string[];
};

export type OutboxManifest = {
  id: string;
  caption: string;
  hashtags: string;
  accounts: SocialAccount[];
  images: string[];
  sourceBatchId: string | null;
  createdAt: string;
  status: "pending" | "posted" | "failed";
};

export const fetchAccounts = async (): Promise<SocialAccount[]> => {
  const res = await fetch("/social/accounts");
  if (!res.ok) throw new Error("failed to load accounts");
  return res.json();
};

export const fetchInbox = async (): Promise<InboxBatch[]> => {
  const res = await fetch("/social/inbox");
  if (!res.ok) throw new Error("failed to load inbox");
  return res.json();
};

export const fetchOutbox = async (): Promise<OutboxManifest[]> => {
  const res = await fetch("/social/outbox");
  if (!res.ok) throw new Error("failed to load outbox");
  return res.json();
};

export const dismissInboxBatch = async (batchId: string): Promise<void> => {
  const res = await fetch(`/social/inbox?batch=${encodeURIComponent(batchId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("failed to dismiss inbox batch");
};

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const mimeFromFilename = (filename: string): string =>
  MIME_BY_EXT[filename.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

export const inboxFileUrl = (batchId: string, filename: string) =>
  `/social/inbox-file?batch=${encodeURIComponent(batchId)}&file=${encodeURIComponent(filename)}`;

export const saveOutboxBatch = async (payload: {
  caption: string;
  hashtags: string;
  accounts: SocialAccount[];
  images: { filename: string; dataUrl: string }[];
  sourceBatchId: string | null;
}): Promise<OutboxManifest> => {
  const res = await fetch("/social/outbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "failed to save outbox batch");
  return res.json();
};

// Fetches a same-origin file (inbox photo) as a File object, so it can drop
// straight into the same Photo state shape as a manually-picked upload.
export const fetchAsFile = async (url: string, filename: string, mime: string): Promise<File> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: mime });
};
