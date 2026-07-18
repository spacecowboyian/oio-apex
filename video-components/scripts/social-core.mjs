/**
 * Shared logic for the social-draft inbox/outbox, used by both the
 * Storybook dev-server middleware (social-middleware.mjs) and the
 * standalone server (social-server.mjs) — same relationship as
 * render-core.mjs has to the batch-render tool.
 *
 * Inbox: Claude stages a photo batch here (copies files + writes
 * prefill.json with corner-label/caption guesses) so the generator can
 * load it without the native file picker.
 *   .social-drafts/inbox/<batchId>/prefill.json
 *   .social-drafts/inbox/<batchId>/<photo files>
 *
 * Outbox: the generator's "Save for posting" button writes here — final
 * PNGs plus a manifest. Claude reads this when told to publish and calls
 * Post-Bridge directly; nothing in this file talks to Post-Bridge.
 *   .social-drafts/outbox/<batchId>/manifest.json
 *   .social-drafts/outbox/<batchId>/<exported PNGs>
 */
import fs from "node:fs/promises";
import path from "node:path";

const DRAFTS_DIRNAME = ".social-drafts";

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const draftsRoot = (projectRoot) => path.join(projectRoot, DRAFTS_DIRNAME);
const inboxRoot = (projectRoot) => path.join(draftsRoot(projectRoot), "inbox");
const outboxRoot = (projectRoot) => path.join(draftsRoot(projectRoot), "outbox");

const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true });

const isBatchDirent = (d) => d.isDirectory() && !d.name.startsWith(".");

export const readAccounts = async (projectRoot) => {
  const raw = await fs.readFile(path.join(projectRoot, "config", "social-accounts.json"), "utf-8");
  return JSON.parse(raw).accounts;
};

export const listInbox = async (projectRoot) => {
  const root = inboxRoot(projectRoot);
  await ensureDir(root);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const batches = [];
  for (const entry of entries.filter(isBatchDirent)) {
    const batchDir = path.join(root, entry.name);
    const files = await fs.readdir(batchDir);
    let prefill = {};
    if (files.includes("prefill.json")) {
      prefill = JSON.parse(await fs.readFile(path.join(batchDir, "prefill.json"), "utf-8"));
    }
    const images = files.filter((f) => f !== "prefill.json" && MIME_BY_EXT[path.extname(f).toLowerCase()]);
    batches.push({ id: entry.name, prefill, images });
  }
  batches.sort((a, b) => a.id.localeCompare(b.id));
  return batches;
};

export const readInboxFile = async (projectRoot, batchId, filename) => {
  if (batchId.includes("..") || filename.includes("..")) throw new Error("invalid path");
  const filePath = path.join(inboxRoot(projectRoot), batchId, filename);
  const data = await fs.readFile(filePath);
  const mime = MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
  return { data, mime };
};

export const deleteInboxBatch = async (projectRoot, batchId) => {
  if (batchId.includes("..")) throw new Error("invalid batch id");
  await fs.rm(path.join(inboxRoot(projectRoot), batchId), { recursive: true, force: true });
};

const dataUrlToBuffer = (dataUrl) => {
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error("expected a base64 data URL");
  return Buffer.from(match[2], "base64");
};

export const writeOutboxBatch = async ({ projectRoot, caption, hashtags, accounts, images, sourceBatchId, now }) => {
  if (!Array.isArray(images) || images.length === 0) throw new Error("images[] is required");
  const id = `${now.toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const batchDir = path.join(outboxRoot(projectRoot), id);
  await ensureDir(batchDir);

  const filenames = [];
  for (const image of images) {
    const filename = image.filename;
    if (!filename || filename.includes("..") || path.isAbsolute(filename)) {
      throw new Error(`invalid image filename: ${filename}`);
    }
    await fs.writeFile(path.join(batchDir, filename), dataUrlToBuffer(image.dataUrl));
    filenames.push(filename);
  }

  const manifest = {
    id,
    caption: caption ?? "",
    hashtags: hashtags ?? "",
    accounts: accounts ?? [],
    images: filenames,
    sourceBatchId: sourceBatchId ?? null,
    createdAt: now.toISOString(),
    status: "pending",
  };
  await fs.writeFile(path.join(batchDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  if (sourceBatchId) {
    await deleteInboxBatch(projectRoot, sourceBatchId).catch(() => {});
  }

  return manifest;
};

export const listOutbox = async (projectRoot) => {
  const root = outboxRoot(projectRoot);
  await ensureDir(root);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const batches = [];
  for (const entry of entries.filter(isBatchDirent)) {
    const manifestPath = path.join(root, entry.name, "manifest.json");
    try {
      batches.push(JSON.parse(await fs.readFile(manifestPath, "utf-8")));
    } catch {
      // no manifest yet (write in progress) — skip
    }
  }
  batches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return batches;
};
